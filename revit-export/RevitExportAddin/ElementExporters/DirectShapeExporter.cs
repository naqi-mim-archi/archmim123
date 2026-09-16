using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace OurApp.RevitExportAddin.ElementExporters;

public sealed class DirectShapeExporter
{
    public void ExportFallbacks(RevitExportContext context)
    {
        using var tx = new Transaction(context.Document, "Create OurApp DirectShape Fallbacks");
        tx.Start();
        foreach (var source in context.Manifest.Elements)
        {
            if (context.IsRegistered(source)) continue;
            if (source.ExportStrategy == "metadata-only" || source.Type is "annotation" or "gridline" or "group" or "room") continue;
            try
            {
                var loop = FallbackFootprint(context, source);
                if (loop == null)
                {
                    ExporterHelpers.MarkSkipped(context, source, "fallback footprint could not be created");
                    continue;
                }
                var height = context.Mapper.ToInternalLength(System.Math.Max(0.02, source.Dimensions.Number("height", source.Dimensions.Number("thickness", 0.5))));
                var solid = GeometryCreationUtilities.CreateExtrusionGeometry(new List<CurveLoop> { loop }, XYZ.BasisZ, height);
                var shape = CreateDirectShape(context, source);
                shape.ApplicationId = "OurApp_RevitExport";
                shape.ApplicationDataId = source.Id;
                shape.SetShape(new List<GeometryObject> { solid });
                var reason = $"No native {source.Type} exporter completed for this element.";
                context.RegisterElement(source, shape, "direct-shape", shape.Category?.Name ?? "Generic Models", fallbackReason: reason);
                context.Warn($"{source.Type} {source.Id} exported as DirectShape fallback: {reason}");
                ExporterHelpers.Count(context, "DirectShape", false);
            }
            catch (System.Exception ex)
            {
                ExporterHelpers.MarkSkipped(context, source, ex.Message);
            }
        }
        tx.Commit();
    }

    private static DirectShape CreateDirectShape(RevitExportContext context, RevitManifestElement source)
    {
        try
        {
            return DirectShape.CreateElement(context.Document, new ElementId(ExporterHelpers.FallbackCategoryFor(source)));
        }
        catch
        {
            return DirectShape.CreateElement(context.Document, new ElementId(BuiltInCategory.OST_GenericModel));
        }
    }

    private static CurveLoop? FallbackFootprint(RevitExportContext context, RevitManifestElement source)
    {
        var boundary = source.Geometry.Points("boundary");
        if (boundary.Count >= 3)
        {
            return LoopFromPoints(context, boundary, source.Dimensions.Number("elevation", 0));
        }

        var p1 = source.Geometry.Point("p1");
        var p2 = source.Geometry.Point("p2");
        if (p1 != null && p2 != null)
        {
            var width = System.Math.Max(0.05, source.Dimensions.Number("width", source.Dimensions.Number("depth", source.Dimensions.Number("thickness", 0.2))));
            var dx = p2.Value.X - p1.Value.X;
            var dy = p2.Value.Y - p1.Value.Y;
            var len = System.Math.Sqrt(dx * dx + dy * dy);
            if (len > 1e-9)
            {
                var nx = -dy / len * width / 2;
                var ny = dx / len * width / 2;
                return LoopFromPoints(context, new List<ManifestPoint>
                {
                    new(p1.Value.X + nx, p1.Value.Y + ny),
                    new(p2.Value.X + nx, p2.Value.Y + ny),
                    new(p2.Value.X - nx, p2.Value.Y - ny),
                    new(p1.Value.X - nx, p1.Value.Y - ny),
                }, source.Dimensions.Number("elevation", source.Dimensions.Number("baseOffset", 0)));
            }
        }

        var position = source.Geometry.Point("position") ?? source.Geometry.Point("insertionPoint") ?? new ManifestPoint(0, 0);
        var boxWidth = System.Math.Max(0.05, source.Dimensions.Number("width", source.Dimensions.Number("thickness", 1)));
        var boxDepth = System.Math.Max(0.05, source.Dimensions.Number("depth", source.Dimensions.Number("thickness", 1)));
        var rotation = source.Geometry.Number("rotation", 0) * System.Math.PI / 180;
        var cos = System.Math.Cos(rotation);
        var sin = System.Math.Sin(rotation);
        var local = new List<ManifestPoint>
        {
            new(-boxWidth / 2, -boxDepth / 2),
            new(boxWidth / 2, -boxDepth / 2),
            new(boxWidth / 2, boxDepth / 2),
            new(-boxWidth / 2, boxDepth / 2),
        };
        return LoopFromPoints(context, local.Select(point => new ManifestPoint(
            position.X + point.X * cos - point.Y * sin,
            position.Y + point.X * sin + point.Y * cos)).ToList(), source.Dimensions.Number("elevation", source.Dimensions.Number("baseOffset", 0)));
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
