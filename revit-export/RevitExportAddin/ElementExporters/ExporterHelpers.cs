using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using Autodesk.Revit.DB;

namespace OurApp.RevitExportAddin.ElementExporters;

internal static class ExporterHelpers
{
    public static IEnumerable<RevitManifestElement> OfType(RevitExportContext context, params string[] types)
    {
        var wanted = new HashSet<string>(types);
        foreach (var element in context.Manifest.Elements)
        {
            if (wanted.Contains(element.Type)) yield return element;
        }
    }

    public static Curve? LineFromPoints(RevitExportContext context, RevitManifestElement source, double z = 0)
    {
        var p1 = source.Geometry.Point("p1");
        var p2 = source.Geometry.Point("p2");
        if (p1 == null || p2 == null) return null;
        return Line.CreateBound(context.Mapper.ToRevitPoint(p1.Value, z), context.Mapper.ToRevitPoint(p2.Value, z));
    }

    public static Curve? CurveFromGeometry(RevitExportContext context, RevitManifestElement source, double z = 0)
    {
        var kind = (source.Geometry.String("kind") ?? source.Geometry.String("annotationKind") ?? source.Type).ToLowerInvariant();
        var p1 = source.Geometry.Point("p1");
        var p2 = source.Geometry.Point("p2");
        var control = source.Geometry.Point("controlPoint");
        var samples = source.Geometry.Points("samples");

        var arcCenter = source.Geometry.Point("arcCenter");
        var arcRadius = source.Geometry.Number("arcRadius", 0);
        if ((kind == "arc" || kind.Contains("arc")) && arcCenter != null && arcRadius > 0)
        {
            var startAngle = source.Geometry.Number("arcStartAngle", 0);
            var endAngle = source.Geometry.Number("arcEndAngle", System.Math.PI);
            var midAngle = MidArcAngle(startAngle, endAngle, source.Geometry.Bool("arcCounterclockwise", false));
            return ArcOrLineFromPoints(
                context.Mapper.ToRevitPoint(PointOnArc(arcCenter.Value, arcRadius, startAngle), z),
                context.Mapper.ToRevitPoint(PointOnArc(arcCenter.Value, arcRadius, midAngle), z),
                context.Mapper.ToRevitPoint(PointOnArc(arcCenter.Value, arcRadius, endAngle), z));
        }

        if ((kind == "arc" || kind.Contains("arc")) && samples.Count >= 3)
        {
            var arc = ArcFromSamples(context, samples, z);
            if (arc != null) return arc;
        }

        if ((kind == "arc" || kind.Contains("arc")) && p1 != null && p2 != null && control != null)
        {
            return Arc.Create(
                context.Mapper.ToRevitPoint(p1.Value, z),
                context.Mapper.ToRevitPoint(p2.Value, z),
                context.Mapper.ToRevitPoint(control.Value, z));
        }

        if (kind == "circle" && p1 != null && p2 != null)
        {
            var radius = context.Mapper.ToRevitPoint(p1.Value, z).DistanceTo(context.Mapper.ToRevitPoint(p2.Value, z));
            return Ellipse.CreateCurve(context.Mapper.ToRevitPoint(p1.Value, z), radius, radius, XYZ.BasisX, XYZ.BasisY, 0, System.Math.PI * 2);
        }

        if (kind == "ellipse" || kind.Contains("ellipse"))
        {
            var center = source.Geometry.Point("ellipseCenter") ?? (p1 != null && p2 != null
                ? new ManifestPoint((p1.Value.X + p2.Value.X) / 2, (p1.Value.Y + p2.Value.Y) / 2)
                : null);
            if (center != null)
            {
                var rx = source.Geometry.Number("ellipseRadiusX", p1 != null && p2 != null ? System.Math.Abs(p2.Value.X - p1.Value.X) / 2 : 0);
                var ry = source.Geometry.Number("ellipseRadiusY", p1 != null && p2 != null ? System.Math.Abs(p2.Value.Y - p1.Value.Y) / 2 : 0);
                if (rx > 0 && ry > 0)
                {
                    var rotation = source.Geometry.Number("ellipseRotation", 0);
                    var xAxis = new XYZ(System.Math.Cos(rotation), -System.Math.Sin(rotation), 0);
                    var yAxis = new XYZ(System.Math.Sin(rotation), System.Math.Cos(rotation), 0);
                    return Ellipse.CreateCurve(
                        context.Mapper.ToRevitPoint(center.Value, z),
                        context.Mapper.ToInternalLength(rx),
                        context.Mapper.ToInternalLength(ry),
                        xAxis,
                        yAxis,
                        source.Geometry.Number("ellipseStartAngle", 0),
                        source.Geometry.Number("ellipseEndAngle", System.Math.PI * 2));
                }
            }
        }

        if (p1 != null && p2 != null) return LineFromPoints(context, source, z);
        return null;
    }

    public static List<Curve> SegmentedCurvesFromSamples(RevitExportContext context, RevitManifestElement source, double z = 0)
    {
        var points = source.Geometry.Points("samples");
        if (points.Count < 2)
        {
            var p1 = source.Geometry.Point("p1");
            var p2 = source.Geometry.Point("p2");
            if (p1 != null && p2 != null) points = new List<ManifestPoint> { p1.Value, p2.Value };
        }
        var curves = new List<Curve>();
        for (var i = 0; i < points.Count - 1; i++)
        {
            var a = context.Mapper.ToRevitPoint(points[i], z);
            var b = context.Mapper.ToRevitPoint(points[i + 1], z);
            if (a.DistanceTo(b) > 1e-6) curves.Add(Line.CreateBound(a, b));
        }
        return curves;
    }

    public static List<Curve> NativeWallCurvesFromGeometry(RevitExportContext context, RevitManifestElement source, double z = 0)
    {
        var kind = (source.Geometry.String("kind") ?? source.Type).ToLowerInvariant();
        var samples = source.Geometry.Points("samples");
        if (kind == "line" || samples.Count < 3)
        {
            var line = LineFromPoints(context, source, z);
            return line == null ? new List<Curve>() : new List<Curve> { line };
        }

        if (kind == "arc")
        {
            var curve = CurveFromGeometry(context, source, z);
            if (curve is Line or Arc) return new List<Curve> { curve };
            var arc = ArcFromSamples(context, samples, z);
            if (arc != null) return new List<Curve> { arc };
            return SegmentedCurvesFromSamples(context, source, z);
        }

        if (kind == "circle" || kind == "ellipse" || kind == "curved")
        {
            return ArcSegmentsFromSamples(context, source, samples, z);
        }

        var fittedArc = ArcFromSamples(context, samples, z);
        if (fittedArc != null) return new List<Curve> { fittedArc };
        return SegmentedCurvesFromSamples(context, source, z);
    }

    private static Arc? ArcFromSamples(RevitExportContext context, IReadOnlyList<ManifestPoint> samples, double z)
    {
        if (samples.Count < 3 || PointDistance(samples[0], samples[^1]) < 1e-6) return null;
        return ArcOrLineFromPoints(
            context.Mapper.ToRevitPoint(samples[0], z),
            context.Mapper.ToRevitPoint(samples[samples.Count / 2], z),
            context.Mapper.ToRevitPoint(samples[^1], z)) as Arc;
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

    private static List<Curve> ArcSegmentsFromSamples(RevitExportContext context, RevitManifestElement source, IReadOnlyList<ManifestPoint> samples, double z)
    {
        var curves = new List<Curve>();
        if (samples.Count < 3) return curves;
        var closed = PointDistance(samples[0], samples[^1]) < 1e-6;
        var segments = PreferredArcSegmentCount(source, samples, closed);
        var last = samples.Count - 1;
        for (var i = 0; i < segments; i++)
        {
            var startIndex = (int)System.Math.Round(i * last / (double)segments);
            var endIndex = (int)System.Math.Round((i + 1) * last / (double)segments);
            var midIndex = (startIndex + endIndex) / 2;
            if (endIndex <= startIndex || midIndex == startIndex || midIndex == endIndex) continue;
            var curve = ArcOrLineFromPoints(
                context.Mapper.ToRevitPoint(samples[startIndex], z),
                context.Mapper.ToRevitPoint(samples[midIndex], z),
                context.Mapper.ToRevitPoint(samples[endIndex], z));
            if (curve != null) curves.Add(curve);
        }
        return curves.Count > 0 ? curves : SegmentedCurvesFromSamples(context, source, z);
    }

    private static int PreferredArcSegmentCount(RevitManifestElement source, IReadOnlyList<ManifestPoint> samples, bool closed)
    {
        var kind = (source.Geometry.String("kind") ?? "").ToLowerInvariant();
        if (!closed) return 1;
        if (kind == "circle" || LooksCircular(source, samples)) return 4;
        return 8;
    }

    private static bool LooksCircular(RevitManifestElement source, IReadOnlyList<ManifestPoint> samples)
    {
        var rx = source.Geometry.Number("ellipseRadiusX", double.NaN);
        var ry = source.Geometry.Number("ellipseRadiusY", double.NaN);
        if (double.IsNaN(rx) || double.IsNaN(ry))
        {
            var p1 = source.Geometry.Point("p1");
            var p2 = source.Geometry.Point("p2");
            if (p1 != null && p2 != null)
            {
                rx = System.Math.Abs(p2.Value.X - p1.Value.X) / 2;
                ry = System.Math.Abs(p2.Value.Y - p1.Value.Y) / 2;
            }
        }
        if (!double.IsNaN(rx) && !double.IsNaN(ry) && rx > 1e-6 && ry > 1e-6)
        {
            return System.Math.Abs(rx - ry) / System.Math.Max(rx, ry) < 0.02;
        }

        var sampleCount = System.Math.Max(1, samples.Count - 1);
        var center = samples.Take(sampleCount)
            .Aggregate(new ManifestPoint(0, 0), (acc, point) => new ManifestPoint(acc.X + point.X, acc.Y + point.Y));
        center = new ManifestPoint(center.X / sampleCount, center.Y / sampleCount);
        var radii = samples.Take(sampleCount).Select(point => PointDistance(point, center)).Where(radius => radius > 1e-6).ToList();
        return radii.Count > 0 && (radii.Max() - radii.Min()) / radii.Max() < 0.03;
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

    private static double PointDistance(ManifestPoint a, ManifestPoint b)
    {
        return System.Math.Sqrt(System.Math.Pow(a.X - b.X, 2) + System.Math.Pow(a.Y - b.Y, 2));
    }

    public static CurveLoop? PathLoop(RevitExportContext context, RevitManifestElement source, double z = 0)
    {
        var curve = CurveFromGeometry(context, source, z);
        if (curve != null)
        {
            var loop = new CurveLoop();
            loop.Append(curve);
            return loop;
        }
        var segments = SegmentedCurvesFromSamples(context, source, z);
        if (segments.Count == 0) return null;
        var segmentedLoop = new CurveLoop();
        foreach (var segment in segments) segmentedLoop.Append(segment);
        return segmentedLoop;
    }

    public static CurveLoop? BoundaryLoop(RevitExportContext context, RevitManifestElement source, double z = 0)
    {
        if (!source.Geometry.TryGetProperty("boundary", out var boundary) || boundary.ValueKind != JsonValueKind.Array) return null;
        var points = new List<XYZ>();
        foreach (var point in boundary.EnumerateArray())
        {
            points.Add(context.Mapper.ToRevitPoint(point.Number("x"), point.Number("y"), z));
        }
        if (points.Count < 4) return null;
        var loop = new CurveLoop();
        for (var i = 0; i < points.Count - 1; i++)
        {
            if (points[i].DistanceTo(points[i + 1]) > 1e-6) loop.Append(Line.CreateBound(points[i], points[i + 1]));
        }
        return loop.IsOpen() ? null : loop;
    }

    public static void Count(RevitExportContext context, string className, bool native)
    {
        context.Report.ClassCounts[className] = context.Report.ClassCounts.TryGetValue(className, out var current) ? current + 1 : 1;
        context.Report.RevitElementCount += 1;
        if (native) context.Report.NativeElementCount += 1;
        else context.Report.FallbackDirectShapeCount += 1;
    }

    public static void MarkSkipped(RevitExportContext context, RevitManifestElement source, string reason)
    {
        context.Report.SkippedElementCount += 1;
        context.Report.Warnings.Add($"{source.Type} {source.Id} skipped: {reason}");
        context.Report.ElementMappings.Add(new RevitElementMapping
        {
            SourceElementId = source.Id,
            SourceType = source.SourceType,
            Result = "skipped",
            Warning = reason,
            Validation = reason,
        });
    }

    public static void TrySetLength(Element element, double internalValue, params string[] names)
    {
        foreach (var name in names)
        {
            var parameter = element.LookupParameter(name);
            if (parameter != null && !parameter.IsReadOnly && parameter.StorageType == StorageType.Double)
            {
                parameter.Set(internalValue);
                return;
            }
        }
    }

    public static void TrySetBuiltInLength(Element element, BuiltInParameter builtInParameter, double internalValue)
    {
        var parameter = element.get_Parameter(builtInParameter);
        if (parameter != null && !parameter.IsReadOnly && parameter.StorageType == StorageType.Double)
        {
            parameter.Set(internalValue);
        }
    }

    public static void TrySetNumber(Element element, double value, params string[] names)
    {
        foreach (var name in names)
        {
            var parameter = element.LookupParameter(name);
            if (parameter != null && !parameter.IsReadOnly)
            {
                if (parameter.StorageType == StorageType.Double) parameter.Set(value);
                else if (parameter.StorageType == StorageType.Integer) parameter.Set((int)System.Math.Round(value));
                return;
            }
        }
    }

    public static void TrySetString(Element element, string value, params string[] names)
    {
        foreach (var name in names)
        {
            var parameter = element.LookupParameter(name);
            if (parameter != null && !parameter.IsReadOnly && parameter.StorageType == StorageType.String)
            {
                parameter.Set(value);
                return;
            }
        }
    }

    public static BuiltInCategory FallbackCategoryFor(RevitManifestElement source) => source.Type switch
    {
        "stair" => BuiltInCategory.OST_Stairs,
        "railing" => BuiltInCategory.OST_Railings,
        "ceiling" => BuiltInCategory.OST_Ceilings,
        "column" => BuiltInCategory.OST_Columns,
        "door" => BuiltInCategory.OST_Doors,
        "window" => BuiltInCategory.OST_Windows,
        "wall-opening" => BuiltInCategory.OST_GenericModel,
        "floor" => BuiltInCategory.OST_Floors,
        "wall" => BuiltInCategory.OST_Walls,
        _ => BuiltInCategory.OST_GenericModel,
    };
}
