using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace OurApp.RevitExportAddin.ElementExporters;

public sealed class WallExporter
{
    public void Export(RevitExportContext context)
    {
        var typeResolver = new RevitTypeResolver();
        using var tx = new Transaction(context.Document, "Create OurApp Walls");
        tx.Start();
        foreach (var source in ExporterHelpers.OfType(context, "wall"))
        {
            try
            {
                var level = context.ResolveLevel(source.LevelId);
                if (level != null && ShouldExportAsDirectShapeBody(source))
                {
                    var directWall = ExportCurvedWallBody(context, source, level);
                    if (directWall != null)
                    {
                        context.RegisterElement(
                            source,
                            directWall,
                            "direct-shape-curved-wall",
                            directWall.Category?.Name ?? "Walls",
                            fallbackReason: "Sampled curved wall exported as one IFC-style extruded wall body to avoid Revit native wall segment joins.",
                            validation: "curved wall body generated from sampled centerline and thickness");
                        ExporterHelpers.Count(context, "DirectShape", false);
                        continue;
                    }
                }

                var curves = ExporterHelpers.NativeWallCurvesFromGeometry(context, source, 0);
                if (level == null || curves.Count == 0)
                {
                    ExporterHelpers.MarkSkipped(context, source, "wall level or native path missing");
                    continue;
                }
                var height = context.Mapper.ToInternalLength(source.Dimensions.Number("height", 3.0));
                var offset = context.Mapper.ToInternalLength(source.Dimensions.Number("baseOffset", 0));
                var wallType = typeResolver.WallTypeForSource(context, source);
                var created = new List<Element>();
                foreach (var curve in curves)
                {
                    try
                    {
                        var wall = Wall.Create(context.Document, curve, wallType?.Id ?? ElementId.InvalidElementId, level.Id, height, offset, false, false);
                        created.Add(wall);
                        ExporterHelpers.Count(context, "Wall", true);
                    }
                    catch (System.Exception segmentEx)
                    {
                        context.Warn($"Wall {source.Id} segment skipped: {segmentEx.Message}");
                    }
                }
                if (created.Count == 0)
                {
                    ExporterHelpers.MarkSkipped(context, source, "no native wall segment could be created");
                    continue;
                }
                context.RegisterElements(
                    source,
                    created,
                    created.Count == 1 ? "native" : "segmented-native",
                    "Walls",
                    validation: $"{(created.Count == 1 ? "native wall curve" : $"segmented native wall from {created.Count} Revit wall curves")}; wallType={wallType?.Name}; wallKind={wallType?.Kind}");
            }
            catch (System.Exception ex)
            {
                ExporterHelpers.MarkSkipped(context, source, ex.Message);
            }
        }
        tx.Commit();
    }

    private static bool ShouldExportAsDirectShapeBody(RevitManifestElement source)
    {
        var kind = (source.Geometry.String("kind") ?? "").ToLowerInvariant();
        if (kind == "line") return false;
        if (kind == "arc" && source.Geometry.Point("arcCenter") != null && source.Geometry.Number("arcRadius", 0) > 0) return false;
        return source.Geometry.Points("samples").Count >= 3;
    }

    private static DirectShape? ExportCurvedWallBody(RevitExportContext context, RevitManifestElement source, Level level)
    {
        var samples = source.Geometry.Points("samples");
        if (samples.Count < 3) return null;
        var thickness = System.Math.Max(0.02, source.Dimensions.Number("thickness", 0.2));
        var boundary = OffsetPolylineBand(samples, thickness);
        if (boundary.Count < 4) return null;
        var baseOffset = source.Dimensions.Number("baseOffset", source.Dimensions.Number("elevation", 0));
        var loop = LoopFromPoints(context, boundary, baseOffset);
        if (loop == null) return null;

        var height = context.Mapper.ToInternalLength(System.Math.Max(0.05, source.Dimensions.Number("height", level.Elevation)));
        var solid = GeometryCreationUtilities.CreateExtrusionGeometry(new List<CurveLoop> { loop }, XYZ.BasisZ, height);
        var shape = CreateCurvedWallDirectShape(context);
        shape.ApplicationId = "OurApp_RevitExport";
        shape.ApplicationDataId = source.Id;
        shape.SetShape(new List<GeometryObject> { solid });
        return shape;
    }

    private static DirectShape CreateCurvedWallDirectShape(RevitExportContext context)
    {
        try
        {
            return DirectShape.CreateElement(context.Document, new ElementId(BuiltInCategory.OST_Walls));
        }
        catch
        {
            return DirectShape.CreateElement(context.Document, new ElementId(BuiltInCategory.OST_GenericModel));
        }
    }

    private static List<ManifestPoint> OffsetPolylineBand(IReadOnlyList<ManifestPoint> sourcePoints, double width)
    {
        var points = RemoveDuplicateConsecutive(sourcePoints);
        if (points.Count < 2) return new List<ManifestPoint>();
        var half = width / 2;
        var normals = new List<ManifestPoint>();
        for (var i = 0; i < points.Count - 1; i++)
        {
            var current = points[i];
            var next = points[i + 1];
            var dx = next.X - current.X;
            var dy = next.Y - current.Y;
            var length = System.Math.Sqrt(dx * dx + dy * dy);
            if (length <= 1e-9) continue;
            normals.Add(new ManifestPoint(-dy / length, dx / length));
        }
        if (normals.Count == 0) return new List<ManifestPoint>();

        var left = new List<ManifestPoint>();
        var right = new List<ManifestPoint>();
        for (var i = 0; i < points.Count; i++)
        {
            var prev = normals[System.Math.Max(0, i - 1)];
            var next = normals[System.Math.Min(normals.Count - 1, i)];
            var nx = prev.X + next.X;
            var ny = prev.Y + next.Y;
            var length = System.Math.Sqrt(nx * nx + ny * ny);
            if (length <= 1e-9)
            {
                nx = next.X;
                ny = next.Y;
                length = System.Math.Sqrt(nx * nx + ny * ny);
            }
            left.Add(new ManifestPoint(points[i].X + nx / length * half, points[i].Y + ny / length * half));
            right.Add(new ManifestPoint(points[i].X - nx / length * half, points[i].Y - ny / length * half));
        }

        right.Reverse();
        return left.Concat(right).ToList();
    }

    private static List<ManifestPoint> RemoveDuplicateConsecutive(IReadOnlyList<ManifestPoint> points)
    {
        var clean = new List<ManifestPoint>();
        foreach (var point in points)
        {
            if (clean.Count == 0 || PointDistance(clean[^1], point) > 1e-7) clean.Add(point);
        }
        if (clean.Count > 2 && PointDistance(clean[0], clean[^1]) <= 1e-7) clean.RemoveAt(clean.Count - 1);
        return clean;
    }

    private static double PointDistance(ManifestPoint a, ManifestPoint b)
    {
        var dx = a.X - b.X;
        var dy = a.Y - b.Y;
        return System.Math.Sqrt(dx * dx + dy * dy);
    }

    private static CurveLoop? LoopFromPoints(RevitExportContext context, IList<ManifestPoint> points, double sourceZ)
    {
        if (points.Count < 3) return null;
        var curves = new List<Curve>();
        for (var i = 0; i < points.Count; i++)
        {
            var a = context.Mapper.ToRevitPoint(points[i], sourceZ);
            var b = context.Mapper.ToRevitPoint(points[(i + 1) % points.Count], sourceZ);
            if (a.DistanceTo(b) > 1e-6) curves.Add(Line.CreateBound(a, b));
        }
        return curves.Count >= 3 ? CurveLoop.Create(curves) : null;
    }
}
