using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using System;
using System.Linq;
using System.Text.RegularExpressions;

namespace OurApp.RevitExportAddin;

public sealed class RevitTypeResolver
{
    public void Prepare(RevitExportContext context)
    {
        context.Report.Validation["typesPrepared"] = true;
    }

    public WallType? DefaultWallType(RevitExportContext context)
    {
        return BasicWallTypes(context).FirstOrDefault()
            ?? new FilteredElementCollector(context.Document).OfClass(typeof(WallType)).Cast<WallType>().FirstOrDefault();
    }

    public WallType? WallTypeForSource(RevitExportContext context, RevitManifestElement source)
    {
        var preset = SourcePreset(source);
        if (IsGlassPartition(source))
        {
            var curtain = CurtainWallTypes(context)
                .FirstOrDefault(type => TypeText(type).Contains("storefront"))
                ?? CurtainWallTypes(context).FirstOrDefault();
            if (curtain != null) return curtain;
        }

        return WallTypeForThickness(context, source.Dimensions.Number("thickness", 0.23), preset);
    }

    public WallType? WallTypeForThickness(RevitExportContext context, double sourceThicknessMeters, string? preset = null)
    {
        var defaultType = PreferredBasicWallType(context, preset);
        if (defaultType == null) return null;
        var thickness = context.Mapper.ToInternalLength(Math.Max(0.01, sourceThicknessMeters));
        var name = WallTypeName(sourceThicknessMeters, preset);
        var existing = new FilteredElementCollector(context.Document)
            .OfClass(typeof(WallType))
            .Cast<WallType>()
            .FirstOrDefault(type => type.Name == name && type.Kind == WallKind.Basic);
        if (existing != null) return existing;

        try
        {
            var duplicate = defaultType.Duplicate(name) as WallType;
            var structure = duplicate?.GetCompoundStructure();
            if (duplicate != null && structure != null && structure.LayerCount > 0)
            {
                var core = Math.Max(0, structure.GetFirstCoreLayerIndex());
                structure.SetLayerWidth(core, thickness);
                duplicate.SetCompoundStructure(structure);
            }
            return duplicate ?? defaultType;
        }
        catch
        {
            return defaultType;
        }
    }

    public FloorType? DefaultFloorType(RevitExportContext context)
    {
        return new FilteredElementCollector(context.Document)
            .OfClass(typeof(FloorType))
            .Cast<FloorType>()
            .OrderByDescending(type => TypeText(type).Contains("generic"))
            .ThenBy(type => type.Name)
            .FirstOrDefault();
    }

    public CeilingType? DefaultCeilingType(RevitExportContext context)
    {
        return new FilteredElementCollector(context.Document)
            .OfClass(typeof(CeilingType))
            .Cast<CeilingType>()
            .OrderByDescending(type => TypeText(type).Contains("generic") || TypeText(type).Contains("compound"))
            .ThenBy(type => type.Name)
            .FirstOrDefault();
    }

    public CeilingType? CeilingTypeForThickness(RevitExportContext context, double sourceThicknessMeters)
    {
        var defaultType = DefaultCeilingType(context);
        if (defaultType == null) return null;
        var thickness = context.Mapper.ToInternalLength(Math.Max(0.02, sourceThicknessMeters));
        var name = $"OurApp Ceiling {Math.Round(sourceThicknessMeters * 1000)}mm";
        var existing = new FilteredElementCollector(context.Document)
            .OfClass(typeof(CeilingType))
            .Cast<CeilingType>()
            .FirstOrDefault(type => type.Name == name);
        if (existing != null)
        {
            MatchCompoundStructureThickness(existing, thickness);
            return existing;
        }

        try
        {
            var duplicate = defaultType.Duplicate(name) as CeilingType;
            if (duplicate != null)
            {
                MatchCompoundStructureThickness(duplicate, thickness);
            }
            return duplicate ?? defaultType;
        }
        catch
        {
            return defaultType;
        }
    }

    public static double CompoundStructureThickness(HostObjAttributes? type)
    {
        var structure = type?.GetCompoundStructure();
        if (structure == null || structure.LayerCount <= 0) return 0;
        var total = 0.0;
        for (var index = 0; index < structure.LayerCount; index++)
        {
            total += structure.GetLayerWidth(index);
        }
        return total;
    }

    private static void MatchCompoundStructureThickness(HostObjAttributes type, double targetThickness)
    {
        var structure = type.GetCompoundStructure();
        if (structure == null || structure.LayerCount <= 0) return;

        var adjustableLayer = 0;
        var widestLayer = 0.0;
        for (var index = 0; index < structure.LayerCount; index++)
        {
            var width = structure.GetLayerWidth(index);
            if (width > widestLayer)
            {
                widestLayer = width;
                adjustableLayer = index;
            }
        }

        var fixedLayerWidth = 0.0;
        for (var index = 0; index < structure.LayerCount; index++)
        {
            if (index != adjustableLayer) fixedLayerWidth += structure.GetLayerWidth(index);
        }

        var adjustedLayerWidth = targetThickness - fixedLayerWidth;
        if (adjustedLayerWidth <= 0) adjustedLayerWidth = targetThickness;
        structure.SetLayerWidth(adjustableLayer, adjustedLayerWidth);
        type.SetCompoundStructure(structure);
    }

    public RailingType? DefaultRailingType(RevitExportContext context, RevitManifestElement? source = null)
    {
        var preset = source == null ? "" : SourcePreset(source);
        var preferred = preset.Contains("balcony") || preset.Contains("glass")
            ? new[] { "glass", "panel", "bottom fill", "guard" }
            : new[] { "handrail", "pipe", "rail" };
        var types = new FilteredElementCollector(context.Document)
            .OfClass(typeof(RailingType))
            .Cast<RailingType>()
            .ToList();
        foreach (var token in preferred)
        {
            var match = types.FirstOrDefault(type => TypeText(type).Contains(token));
            if (match != null) return match;
        }
        return types.OrderBy(type => type.Name).FirstOrDefault();
    }

    public TextNoteType? DefaultTextNoteType(RevitExportContext context)
    {
        return new FilteredElementCollector(context.Document).OfClass(typeof(TextNoteType)).FirstElement() as TextNoteType;
    }

    public ViewFamilyType? DefaultPlanViewType(RevitExportContext context, ViewFamily family = ViewFamily.FloorPlan)
    {
        return new FilteredElementCollector(context.Document)
            .OfClass(typeof(ViewFamilyType))
            .Cast<ViewFamilyType>()
            .FirstOrDefault(type => type.ViewFamily == family);
    }

    private static IQueryable<WallType> BasicWallTypes(RevitExportContext context)
    {
        return new FilteredElementCollector(context.Document)
            .OfClass(typeof(WallType))
            .Cast<WallType>()
            .Where(type => type.Kind == WallKind.Basic)
            .AsQueryable();
    }

    private static IQueryable<WallType> CurtainWallTypes(RevitExportContext context)
    {
        return new FilteredElementCollector(context.Document)
            .OfClass(typeof(WallType))
            .Cast<WallType>()
            .Where(type => type.Kind == WallKind.Curtain)
            .AsQueryable();
    }

    private static WallType? PreferredBasicWallType(RevitExportContext context, string? preset)
    {
        var types = BasicWallTypes(context).ToList();
        if (types.Count == 0) return null;
        var text = preset ?? "";
        var preferred = text switch
        {
            var s when s.Contains("commercial") => new[] { "brick", "cmu", "exterior" },
            var s when s.Contains("structural") => new[] { "cmu", "concrete", "masonry", "interior" },
            var s when s.Contains("lightweight") => new[] { "metal", "stud", "stucco", "exterior" },
            var s when s.Contains("partition") => new[] { "partition", "interior", "stud" },
            var s when s.Contains("interior") => new[] { "interior", "partition", "stud" },
            _ => new[] { "basic", "generic", "exterior", "brick" },
        };
        foreach (var token in preferred)
        {
            var match = types.FirstOrDefault(type => TypeText(type).Contains(token));
            if (match != null) return match;
        }
        return types.OrderBy(type => type.Name).First();
    }

    private static string WallTypeName(double sourceThicknessMeters, string? preset)
    {
        var mm = Math.Round(sourceThicknessMeters * 1000);
        if (!string.IsNullOrWhiteSpace(preset) && preset != "wall")
        {
            return $"MC_Wall_{SafeName(preset)}_{mm}mm";
        }
        return $"OurApp Wall {mm}mm";
    }

    private static bool IsGlassPartition(RevitManifestElement source)
    {
        var text = SourcePreset(source);
        return text.Contains("glass partition") || text.Contains("curtain wall") || text.Contains("storefront");
    }

    private static string SourcePreset(RevitManifestElement source)
    {
        var tokens = new[] { source.Label, source.SubType, source.Metadata.String("originalNativeType"), source.Category }
            .Select(token => (token ?? "").Trim().ToLowerInvariant())
            .Where(token => !string.IsNullOrWhiteSpace(token))
            .Distinct()
            .ToList();
        return tokens.Count == 0 ? source.Type.ToLowerInvariant() : string.Join(" ", tokens);
    }

    private static string TypeText(ElementType type)
    {
        return $"{type.FamilyName} {type.Name}".ToLowerInvariant();
    }

    private static string SafeName(string value)
    {
        var cleaned = Regex.Replace(value.Trim(), "[^A-Za-z0-9]+", "_").Trim('_');
        return string.IsNullOrWhiteSpace(cleaned) ? "Generic" : cleaned;
    }
}
