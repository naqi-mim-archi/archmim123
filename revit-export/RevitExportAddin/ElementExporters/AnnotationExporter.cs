using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace OurApp.RevitExportAddin.ElementExporters;

public sealed class AnnotationExporter
{
    public void Export(RevitExportContext context)
    {
        var typeResolver = new RevitTypeResolver();
        using var tx = new Transaction(context.Document, "Create OurApp Plan Annotations");
        tx.Start();
        foreach (var source in ExporterHelpers.OfType(context, "annotation"))
        {
            try
            {
                var level = context.ResolveLevel(source.LevelId);
                if (level == null)
                {
                    ExporterHelpers.MarkSkipped(context, source, "annotation level missing");
                    continue;
                }
                var view = GetOrCreatePlanView(context, level, typeResolver);
                if (view == null)
                {
                    ExporterHelpers.MarkSkipped(context, source, "plan view type unavailable");
                    continue;
                }

                var kind = (source.Geometry.String("annotationKind") ?? source.SourceType).ToLowerInvariant();
                var created = new List<Element>();
                if (kind == "label" || kind == "elevation-marker")
                {
                    var textType = typeResolver.DefaultTextNoteType(context);
                    var position = source.Geometry.Point("position");
                    if (textType == null || position == null)
                    {
                        ExporterHelpers.MarkSkipped(context, source, "text note type or position missing");
                        continue;
                    }
                    var text = !string.IsNullOrWhiteSpace(source.Label) ? source.Label! : source.SourceType;
                    var note = TextNote.Create(context.Document, view.Id, context.Mapper.ToRevitPointAtInternalZ(position.Value, level.Elevation), text, textType.Id);
                    RotateIfNeeded(context, note.Id, position.Value, level.Elevation, source.Geometry.Number("rotation", 0));
                    created.Add(note);
                }
                else if (kind == "rectangle" || kind == "rect")
                {
                    foreach (var curve in RectangleCurves(context, source, level.Elevation))
                    {
                        created.Add(context.Document.Create.NewDetailCurve(view, curve));
                    }
                }
                else
                {
                    var curve = AnnotationCurve(context, source, level.Elevation);
                    if (curve == null)
                    {
                        ExporterHelpers.MarkSkipped(context, source, $"unsupported annotation curve kind {kind}");
                        continue;
                    }
                    created.Add(context.Document.Create.NewDetailCurve(view, curve));
                }

                context.RegisterElements(source, created, "native", "Detail Items", validation: $"plan annotation visible in {view.Name}");
                foreach (var _ in created) ExporterHelpers.Count(context, kind == "label" || kind == "elevation-marker" ? "TextNote" : "DetailCurve", true);
            }
            catch (System.Exception ex)
            {
                ExporterHelpers.MarkSkipped(context, source, ex.Message);
            }
        }
        tx.Commit();
    }

    private static ViewPlan? GetOrCreatePlanView(RevitExportContext context, Level level, RevitTypeResolver typeResolver)
    {
        var existing = new FilteredElementCollector(context.Document)
            .OfClass(typeof(ViewPlan))
            .Cast<ViewPlan>()
            .FirstOrDefault(view => !view.IsTemplate && view.GenLevel != null && view.GenLevel.Id == level.Id);
        if (existing != null) return existing;
        var viewType = typeResolver.DefaultPlanViewType(context);
        if (viewType == null) return null;
        var view = ViewPlan.Create(context.Document, viewType.Id, level.Id);
        try { view.Name = $"OurApp Plan - {level.Name}"; } catch { }
        return view;
    }

    private static Curve? AnnotationCurve(RevitExportContext context, RevitManifestElement source, double internalZ)
    {
        var kind = (source.Geometry.String("annotationKind") ?? source.SourceType).ToLowerInvariant();
        var p1 = source.Geometry.Point("p1");
        var p2 = source.Geometry.Point("p2");
        var control = source.Geometry.Point("controlPoint");
        var samples = source.Geometry.Points("samples");
        if ((kind == "line" || kind == "dimension") && p1 != null && p2 != null)
        {
            return Line.CreateBound(context.Mapper.ToRevitPointAtInternalZ(p1.Value, internalZ), context.Mapper.ToRevitPointAtInternalZ(p2.Value, internalZ));
        }
        if (kind == "arc")
        {
            var arcCenter = source.Geometry.Point("arcCenter");
            var arcRadius = source.Geometry.Number("arcRadius", 0);
            if (arcCenter != null && arcRadius > 0)
            {
                var startAngle = source.Geometry.Number("arcStartAngle", 0);
                var endAngle = source.Geometry.Number("arcEndAngle", System.Math.PI);
                var midAngle = MidArcAngle(startAngle, endAngle, source.Geometry.Bool("arcCounterclockwise", false));
                return ArcOrLineFromPoints(
                    context.Mapper.ToRevitPointAtInternalZ(PointOnArc(arcCenter.Value, arcRadius, startAngle), internalZ),
                    context.Mapper.ToRevitPointAtInternalZ(PointOnArc(arcCenter.Value, arcRadius, midAngle), internalZ),
                    context.Mapper.ToRevitPointAtInternalZ(PointOnArc(arcCenter.Value, arcRadius, endAngle), internalZ));
            }
            if (samples.Count >= 3)
            {
                var sampledArc = ArcOrLineFromPoints(
                    context.Mapper.ToRevitPointAtInternalZ(samples[0], internalZ),
                    context.Mapper.ToRevitPointAtInternalZ(samples[samples.Count / 2], internalZ),
                    context.Mapper.ToRevitPointAtInternalZ(samples[^1], internalZ));
                if (sampledArc != null) return sampledArc;
            }
        }
        if (kind == "arc" && p1 != null && p2 != null && control != null)
        {
            return Arc.Create(
                context.Mapper.ToRevitPointAtInternalZ(p1.Value, internalZ),
                context.Mapper.ToRevitPointAtInternalZ(p2.Value, internalZ),
                context.Mapper.ToRevitPointAtInternalZ(control.Value, internalZ));
        }
        if (kind == "circle" && p1 != null && p2 != null)
        {
            var center = context.Mapper.ToRevitPointAtInternalZ(p1.Value, internalZ);
            var radius = center.DistanceTo(context.Mapper.ToRevitPointAtInternalZ(p2.Value, internalZ));
            return Ellipse.CreateCurve(center, radius, radius, XYZ.BasisX, XYZ.BasisY, 0, System.Math.PI * 2);
        }
        if (kind == "ellipse")
        {
            var centerPoint = source.Geometry.Point("ellipseCenter") ?? (p1 != null && p2 != null
                ? new ManifestPoint((p1.Value.X + p2.Value.X) / 2, (p1.Value.Y + p2.Value.Y) / 2)
                : null);
            if (centerPoint != null && p1 != null && p2 != null)
            {
                var rx = context.Mapper.ToInternalLength(source.Geometry.Number("ellipseRadiusX", System.Math.Abs(p2.Value.X - p1.Value.X) / 2));
                var ry = context.Mapper.ToInternalLength(source.Geometry.Number("ellipseRadiusY", System.Math.Abs(p2.Value.Y - p1.Value.Y) / 2));
                var rotation = source.Geometry.Number("ellipseRotation", 0);
                var xAxis = new XYZ(System.Math.Cos(rotation), -System.Math.Sin(rotation), 0);
                var yAxis = new XYZ(System.Math.Sin(rotation), System.Math.Cos(rotation), 0);
                return Ellipse.CreateCurve(
                    context.Mapper.ToRevitPointAtInternalZ(centerPoint.Value, internalZ),
                    rx,
                    ry,
                    xAxis,
                    yAxis,
                    source.Geometry.Number("ellipseStartAngle", 0),
                    source.Geometry.Number("ellipseEndAngle", System.Math.PI * 2));
            }
        }
        return null;
    }

    private static Curve? ArcOrLineFromPoints(XYZ start, XYZ mid, XYZ end)
    {
        if (start.DistanceTo(end) <= 1e-7) return null;
        var chord = end - start;
        var offset = mid - start;
        if (chord.CrossProduct(offset).GetLength() <= 1e-8)
        {
            return Line.CreateBound(start, end);
        }
        try
        {
            return Arc.Create(start, end, mid);
        }
        catch
        {
            return Line.CreateBound(start, end);
        }
    }

    private static double MidArcAngle(double start, double end, bool counterclockwise)
    {
        var span = counterclockwise ? start - end : end - start;
        if (span < 0) span += System.Math.PI * 2;
        return counterclockwise ? start - span / 2 : start + span / 2;
    }

    private static ManifestPoint PointOnArc(ManifestPoint center, double radius, double angle)
    {
        return new ManifestPoint(center.X + System.Math.Cos(angle) * radius, center.Y + System.Math.Sin(angle) * radius);
    }

    private static IEnumerable<Curve> RectangleCurves(RevitExportContext context, RevitManifestElement source, double internalZ)
    {
        var p1 = source.Geometry.Point("p1");
        var p2 = source.Geometry.Point("p2");
        if (p1 == null || p2 == null) yield break;
        var points = new[]
        {
            p1.Value,
            new ManifestPoint(p2.Value.X, p1.Value.Y),
            p2.Value,
            new ManifestPoint(p1.Value.X, p2.Value.Y),
            p1.Value,
        };
        for (var i = 0; i < points.Length - 1; i++)
        {
            yield return Line.CreateBound(context.Mapper.ToRevitPointAtInternalZ(points[i], internalZ), context.Mapper.ToRevitPointAtInternalZ(points[i + 1], internalZ));
        }
    }

    private static void RotateIfNeeded(RevitExportContext context, ElementId id, ManifestPoint origin, double internalZ, double degrees)
    {
        if (System.Math.Abs(degrees) < 1e-6) return;
        var point = context.Mapper.ToRevitPointAtInternalZ(origin, internalZ);
        var axis = Line.CreateBound(point, point + XYZ.BasisZ);
        ElementTransformUtils.RotateElement(context.Document, id, axis, context.Mapper.ToRadians(degrees));
    }
}
