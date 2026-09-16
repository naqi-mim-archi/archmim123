using Autodesk.Revit.DB;
using System.Collections.Generic;
using System.Linq;

namespace OurApp.RevitExportAddin.ElementExporters;

public sealed class DoorWindowExporter
{
    public void Export(RevitExportContext context)
    {
        var familyResolver = new RevitFamilyResolver();
        using var tx = new Transaction(context.Document, "Create OurApp Doors and Windows");
        tx.Start();
        foreach (var source in ExporterHelpers.OfType(context, "door", "window"))
        {
            try
            {
                var level = context.ResolveLevel(source.LevelId);
                var insertion = source.Geometry.Point("hostProjectedPoint") ?? source.Geometry.Point("insertionPoint");
                var hostWall = ResolveHostWall(context, source, insertion);
                if (level == null || insertion == null || hostWall == null)
                {
                    context.Warn($"{source.Type} {source.Id} needs fallback because its level, insertion point, or host wall could not be resolved.");
                    continue;
                }
                var width = context.Mapper.ToInternalLength(source.Dimensions.Number("width", 0));
                var height = context.Mapper.ToInternalLength(source.Dimensions.Number("height", 0));
                var baseOffset = source.Dimensions.Number("baseOffset", 0);
                var insertionElevation = source.Type == "window"
                    ? source.Dimensions.Number("sillHeight", baseOffset)
                    : baseOffset;
                var point = context.Mapper.ToRevitPoint(insertion.Value, insertionElevation);

                var candidates = source.Type == "door"
                    ? ResolveDoorSymbols(context, familyResolver, source)
                    : ResolveWindowSymbols(context, familyResolver, source);
                if (candidates.Count == 0)
                {
                    context.Warn($"{source.Type} {source.Id} has no loaded family symbol and will need DirectShape fallback.");
                    continue;
                }
                var placement = PlaceFirstValidHostedFamily(context, source, candidates, hostWall, level, point, width, height);
                var instance = placement.Instance;
                var symbol = placement.Symbol;
                var hostedByWall = placement.HostedByWall;
                var hostHasInsert = placement.HostHasInsert;
                if (!hostedByWall || !hostHasInsert)
                {
                    context.Warn($"{source.Type} {source.Id} was created as a hosted family, but Revit did not report it as a wall insert; automatic host cutting may be incomplete.");
                }
                context.RegisterElement(
                    source,
                    instance,
                    "native",
                    instance.Category?.Name ?? (source.Type == "door" ? "Doors" : "Windows"),
                    validation: $"host={hostWall.Id.Value}; family={symbol.FamilyName}:{symbol.Name}; preset={PresetText(source)}; hosted={hostedByWall}; hostInsert={hostHasInsert}; {DoorSwingValidation(source, instance)}placementAttempts={placement.Attempts}");
                ExporterHelpers.Count(context, source.Type == "door" ? "Door" : "Window", true);
            }
            catch (System.Exception ex)
            {
                ExporterHelpers.MarkSkipped(context, source, ex.Message);
            }
        }
        tx.Commit();
    }

    private static string[] PreferredDoorFamilyNames(RevitManifestElement source)
    {
        var preset = PresetText(source);
        if (preset.Contains("fold") || preset.Contains("bifold"))
        {
            return new[] { "folding_door", "folding door", "single-flush", "single flush" };
        }
        if (preset.Contains("sliding") || preset.Contains("slider"))
        {
            return new[]
            {
                "sliding_door_2_panel_01",
                "sliding door 2 panel 01",
                "single-flush",
                "single flush"
            };
        }
        if (preset.Contains("double") || preset.Contains("dbl"))
        {
            return new[] { "double-flush-double acting", "double flush double acting", "double-flush", "double flush", "single-flush", "single flush" };
        }
        if (preset.Contains("glass"))
        {
            return new[] { "glass_door", "glass door", "single-flush", "single flush" };
        }
        return new[] { "single-flush", "single flush", "single", "door" };
    }

    private static List<FamilySymbol> ResolveDoorSymbols(RevitExportContext context, RevitFamilyResolver familyResolver, RevitManifestElement source)
    {
        return familyResolver.FindSymbols(context, BuiltInCategory.OST_Doors, PreferredDoorFamilyNames(source));
    }

    private static List<FamilySymbol> ResolveWindowSymbols(RevitExportContext context, RevitFamilyResolver familyResolver, RevitManifestElement source)
    {
        var symbol = familyResolver.FindSymbol(context, BuiltInCategory.OST_Windows, PreferredWindowFamilyNames(source));
        return symbol == null ? new List<FamilySymbol>() : new List<FamilySymbol> { symbol };
    }

    private static string[] PreferredWindowFamilyNames(RevitManifestElement source)
    {
        var preset = PresetText(source);
        if (preset.Contains("casement")) return new[] { "window-casement", "casement", "window" };
        if (preset.Contains("double") || preset.Contains("hung")) return new[] { "window-double-hung", "double-hung", "hung", "window" };
        return new[] { "fixed", "window-casement", "window-double-hung", "window" };
    }

    private static FamilySymbol ResolveSizedType(RevitExportContext context, FamilySymbol symbol, RevitManifestElement source, double width, double height)
    {
        var typeName = $"{(source.Type == "door" ? "MC_Door" : "MC_Window")}_{SafeName(PresetText(source))}_{FormatSize(context, width)}x{FormatSize(context, height)}";
        var categoryId = symbol.Category?.Id;
        var existing = new FilteredElementCollector(context.Document)
            .OfClass(typeof(FamilySymbol))
            .Cast<FamilySymbol>()
            .FirstOrDefault(candidate => candidate.Category?.Id.Equals(categoryId) == true && candidate.FamilyName == symbol.FamilyName && candidate.Name == typeName);
        if (existing != null) return existing;
        try
        {
            return symbol.Duplicate(typeName) as FamilySymbol ?? symbol;
        }
        catch
        {
            return symbol;
        }
    }

    private static string PresetText(RevitManifestElement source)
    {
        var tokens = new[] { source.Label, source.SubType, source.Metadata.String("originalNativeType"), source.Category }
            .Select(token => (token ?? "").Trim().ToLowerInvariant())
            .Where(token => !string.IsNullOrWhiteSpace(token))
            .Distinct()
            .ToList();
        return tokens.Count == 0 ? source.Type.ToLowerInvariant() : string.Join(" ", tokens);
    }

    private static string FormatSize(RevitExportContext context, double internalLength)
    {
        var meters = UnitUtils.ConvertFromInternalUnits(internalLength, UnitTypeId.Meters);
        if ((context.Manifest.Project.UnitSystem ?? "").ToLowerInvariant().Contains("imperial"))
        {
            return $"{System.Math.Round(meters / 0.0254)}in";
        }
        return $"{System.Math.Round(meters * 1000)}mm";
    }

    private static string SafeName(string value)
    {
        var cleaned = System.Text.RegularExpressions.Regex.Replace(value.Trim(), "[^A-Za-z0-9]+", "_").Trim('_');
        return string.IsNullOrWhiteSpace(cleaned) ? "Generic" : cleaned;
    }

    private static FamilyInstance CreateHostedInstance(
        RevitExportContext context,
        RevitManifestElement source,
        FamilySymbol symbol,
        Wall hostWall,
        Level level,
        XYZ point,
        double width,
        double height)
    {
        var instance = context.Document.Create.NewFamilyInstance(point, symbol, hostWall, level, Autodesk.Revit.DB.Structure.StructuralType.NonStructural);
        if (width > 0) ExporterHelpers.TrySetLength(instance, width, "Width", "Rough Width");
        if (height > 0) ExporterHelpers.TrySetLength(instance, height, "Height", "Rough Height");
        if (source.Type == "window")
        {
            var sillHeight = context.Mapper.ToInternalLength(source.Dimensions.Number("sillHeight", 0));
            var topHeight = context.Mapper.ToInternalLength(source.Dimensions.Number("topHeight", source.Dimensions.Number("sillHeight", 0) + source.Dimensions.Number("height", 0)));
            ExporterHelpers.TrySetLength(instance, sillHeight, "Sill Height", "Default Sill Height");
            ExporterHelpers.TrySetBuiltInLength(instance, BuiltInParameter.INSTANCE_SILL_HEIGHT_PARAM, sillHeight);
            ExporterHelpers.TrySetLength(instance, topHeight, "Head Height", "Top Height");
        }
        if (source.Type == "door")
        {
            MatchDoorSwing(source, instance);
        }
        else
        {
            if (source.Geometry.Bool("facingFlipped") && instance.CanFlipFacing)
            {
                instance.flipFacing();
            }
            if (source.Geometry.Bool("handFlipped") && instance.CanFlipHand)
            {
                instance.flipHand();
            }
        }
        return instance;
    }

    private static void MatchDoorSwing(RevitManifestElement source, FamilyInstance instance)
    {
        var desiredFacing = DesiredDoorFacingFlipped(source);
        var desiredHand = DesiredDoorHandFlipped(source);
        if (instance.CanFlipFacing && instance.FacingFlipped != desiredFacing)
        {
            instance.flipFacing();
        }
        if (instance.CanFlipHand && instance.HandFlipped != desiredHand)
        {
            instance.flipHand();
        }
    }

    private static bool DesiredDoorFacingFlipped(RevitManifestElement source)
    {
        var appFacing = source.Geometry.Bool("facingFlipped");
        return MirrorsSwingAcrossRevitYAxis(source) ? !appFacing : appFacing;
    }

    private static bool DesiredDoorHandFlipped(RevitManifestElement source)
    {
        var appHand = source.Geometry.Bool("handFlipped");
        return MirrorsHandAcrossRevitYAxis(source) ? !appHand : appHand;
    }

    private static bool MirrorsSwingAcrossRevitYAxis(RevitManifestElement source)
    {
        var preset = PresetText(source);
        return !preset.Contains("sliding") && !preset.Contains("slider") && !preset.Contains("pocket");
    }

    private static bool MirrorsHandAcrossRevitYAxis(RevitManifestElement source)
    {
        var preset = PresetText(source);
        return MirrorsSwingAcrossRevitYAxis(source)
            && !preset.Contains("double")
            && !preset.Contains("dbl")
            && !preset.Contains("fold")
            && !preset.Contains("bifold");
    }

    private static string DoorSwingValidation(RevitManifestElement source, FamilyInstance instance)
    {
        if (source.Type != "door") return "";
        return $"swingFacingApp={source.Geometry.Bool("facingFlipped")}; swingFacingRevitTarget={DesiredDoorFacingFlipped(source)}->{instance.FacingFlipped}; swingHandApp={source.Geometry.Bool("handFlipped")}; swingHandRevitTarget={DesiredDoorHandFlipped(source)}->{instance.HandFlipped}; ";
    }

    private static HostedPlacement PlaceFirstValidHostedFamily(
        RevitExportContext context,
        RevitManifestElement source,
        IReadOnlyList<FamilySymbol> candidates,
        Wall hostWall,
        Level level,
        XYZ point,
        double width,
        double height)
    {
        FamilyInstance? lastInstance = null;
        FamilySymbol? lastSymbol = null;
        var lastHosted = false;
        var lastInsert = false;
        var attempts = new List<string>();
        for (var index = 0; index < candidates.Count; index++)
        {
            var sizedSymbol = ResolveSizedType(context, candidates[index], source, width, height);
            if (!sizedSymbol.IsActive) sizedSymbol.Activate();
            if (width > 0) ExporterHelpers.TrySetLength(sizedSymbol, width, "Width", "Rough Width");
            if (height > 0) ExporterHelpers.TrySetLength(sizedSymbol, height, "Height", "Rough Height");
            context.Document.Regenerate();

            var instance = CreateHostedInstance(context, source, sizedSymbol, hostWall, level, point, width, height);
            context.Document.Regenerate();
            var hosted = instance.Host?.Id.Equals(hostWall.Id) == true;
            var insert = hostWall.FindInserts(true, true, true, true).Contains(instance.Id);
            attempts.Add($"{sizedSymbol.FamilyName}:{sizedSymbol.Name}:hosted={hosted}:insert={insert}");
            if (source.Type != "door" || (hosted && insert))
            {
                return new HostedPlacement(instance, sizedSymbol, hosted, insert, string.Join(" | ", attempts));
            }

            if (index < candidates.Count - 1)
            {
                context.Document.Delete(instance.Id);
                continue;
            }

            lastInstance = instance;
            lastSymbol = sizedSymbol;
            lastHosted = hosted;
            lastInsert = insert;
        }
        if (lastInstance != null && lastSymbol != null)
        {
            return new HostedPlacement(lastInstance, lastSymbol, lastHosted, lastInsert, string.Join(" | ", attempts));
        }
        throw new System.InvalidOperationException("No hosted family candidate could be placed.");
    }

    private sealed record HostedPlacement(FamilyInstance Instance, FamilySymbol Symbol, bool HostedByWall, bool HostHasInsert, string Attempts);

    private static Wall? ResolveHostWall(RevitExportContext context, RevitManifestElement source, ManifestPoint? insertion)
    {
        var hostSourceId = source.Relationships.String("hostWallId");
        if (hostSourceId == null || insertion == null) return null;
        var ids = context.ElementIdsListBySourceId.TryGetValue(hostSourceId, out var list)
            ? list
            : context.ElementIdsBySourceId.TryGetValue(hostSourceId, out var single)
                ? new System.Collections.Generic.List<ElementId> { single }
                : null;
        if (ids == null || ids.Count == 0) return null;

        var insertionPoint = context.Mapper.ToRevitPoint(insertion.Value, 0);
        Wall? best = null;
        var bestDistance = double.MaxValue;
        foreach (var id in ids)
        {
            if (context.Document.GetElement(id) is not Wall wall) continue;
            var curve = (wall.Location as LocationCurve)?.Curve;
            var projected = curve?.Project(insertionPoint);
            var distance = projected?.XYZPoint.DistanceTo(insertionPoint) ?? 0;
            if (distance < bestDistance)
            {
                bestDistance = distance;
                best = wall;
            }
        }
        return best;
    }
}
