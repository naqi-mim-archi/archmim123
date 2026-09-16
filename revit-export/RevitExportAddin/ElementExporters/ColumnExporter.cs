using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Structure;
using System.Linq;

namespace OurApp.RevitExportAddin.ElementExporters;

public sealed class ColumnExporter
{
    public void Export(RevitExportContext context)
    {
        var familyResolver = new RevitFamilyResolver();
        using var tx = new Transaction(context.Document, "Create OurApp Columns");
        tx.Start();
        foreach (var source in ExporterHelpers.OfType(context, "column"))
        {
            try
            {
                var level = context.ResolveLevel(source.LevelId);
                var position = source.Geometry.Point("position");
                var isRound = IsRoundColumn(source);
                var symbol = ResolveColumnSymbol(context, familyResolver, isRound);
                if (level == null || position == null || symbol == null)
                {
                    context.Warn($"Column {source.Id} needs DirectShape fallback because a level, position, or family symbol was unavailable.");
                    continue;
                }
                var width = context.Mapper.ToInternalLength(source.Dimensions.Number("width", 0));
                var depth = context.Mapper.ToInternalLength(source.Dimensions.Number("depth", source.Dimensions.Number("width", 0)));
                var height = ResolveColumnHeight(context, source, level);
                var baseOffset = context.Mapper.ToInternalLength(source.Dimensions.Number("baseOffset", 0));
                symbol = ResolveSizedType(context, symbol, source, isRound, width, depth);
                ExporterHelpers.TrySetLength(symbol, width, "Width", "b");
                ExporterHelpers.TrySetLength(symbol, depth, "Depth", "h");
                if (isRound)
                {
                    ExporterHelpers.TrySetLength(symbol, width, "Diameter", "diameter", "d");
                }
                if (!symbol.IsActive) symbol.Activate();
                var structuralType = symbol.Category?.Id.Value == new ElementId(BuiltInCategory.OST_StructuralColumns).Value
                    ? StructuralType.Column
                    : StructuralType.NonStructural;
                var instance = context.Document.Create.NewFamilyInstance(context.Mapper.ToRevitPoint(position.Value), symbol, level, structuralType);
                ExporterHelpers.TrySetLength(instance, width, "Width", "b");
                ExporterHelpers.TrySetLength(instance, depth, "Depth", "h");
                if (isRound)
                {
                    ExporterHelpers.TrySetLength(instance, width, "Diameter", "diameter", "d");
                }
                ApplyVerticalConstraints(context, source, instance, level, baseOffset, height);
                RotateIfNeeded(context, instance.Id, position.Value, source.Geometry.Number("rotation", source.Dimensions.Number("rotation", 0)));
                context.RegisterElement(
                    source,
                    instance,
                    "native",
                    instance.Category?.Name ?? "Columns",
                    validation: $"shape={(isRound ? "round" : "rectangular")}; family={symbol.FamilyName}:{symbol.Name}; category={symbol.Category?.Name}; structuralType={structuralType}; height={FormatSize(context, height)}; baseOffset={FormatSize(context, baseOffset)}");
                ExporterHelpers.Count(context, "Column", true);
            }
            catch (System.Exception ex)
            {
                ExporterHelpers.MarkSkipped(context, source, ex.Message);
            }
        }
        tx.Commit();
    }

    private static bool IsRoundColumn(RevitManifestElement source)
    {
        var text = $"{source.Geometry.String("shape")} {source.Label} {source.SubType} {source.Category} {source.Metadata.String("originalNativeType")}"
            .ToLowerInvariant();
        return text.Contains("circle") || text.Contains("round") || text.Contains("circular");
    }

    private static FamilySymbol? ResolveColumnSymbol(RevitExportContext context, RevitFamilyResolver familyResolver, bool isRound)
    {
        var preferred = isRound
            ? new[] { "concrete round column", "round column", "circular column", "round", "circular" }
            : new[] { "concrete rectangular column", "rectangular column", "rectangle column", "rectangular", "square column" };

        return familyResolver.FindSymbol(context, BuiltInCategory.OST_Columns, preferred)
            ?? familyResolver.FindSymbol(context, BuiltInCategory.OST_StructuralColumns, preferred)
            ?? familyResolver.FindSymbol(context, preferred[0]);
    }

    private static double ResolveColumnHeight(RevitExportContext context, RevitManifestElement source, Level level)
    {
        var sourceHeight = source.Dimensions.Number("height", 0);
        if (sourceHeight > 0) return context.Mapper.ToInternalLength(sourceHeight);
        var sourceLevel = context.Manifest.Levels.FirstOrDefault(item => item.Id == source.LevelId);
        if (sourceLevel != null && sourceLevel.Height > 0) return context.Mapper.ToInternalLength(sourceLevel.Height);
        return context.Mapper.ToInternalLength(3.048);
    }

    private static void ApplyVerticalConstraints(RevitExportContext context, RevitManifestElement source, FamilyInstance instance, Level baseLevel, double baseOffset, double height)
    {
        TrySetElementId(instance, BuiltInParameter.FAMILY_BASE_LEVEL_PARAM, baseLevel.Id);
        ExporterHelpers.TrySetBuiltInLength(instance, BuiltInParameter.FAMILY_BASE_LEVEL_OFFSET_PARAM, baseOffset);
        ExporterHelpers.TrySetLength(instance, baseOffset, "Base Offset", "Offset");

        var topElevation = baseLevel.Elevation + baseOffset + height;
        var topLevel = ResolveTopLevel(context, baseLevel, topElevation);
        if (topLevel != null)
        {
            TrySetElementId(instance, BuiltInParameter.FAMILY_TOP_LEVEL_PARAM, topLevel.Id);
            ExporterHelpers.TrySetBuiltInLength(instance, BuiltInParameter.FAMILY_TOP_LEVEL_OFFSET_PARAM, topElevation - topLevel.Elevation);
        }
        else
        {
            TrySetElementId(instance, BuiltInParameter.FAMILY_TOP_LEVEL_PARAM, baseLevel.Id);
            ExporterHelpers.TrySetBuiltInLength(instance, BuiltInParameter.FAMILY_TOP_LEVEL_OFFSET_PARAM, baseOffset + height);
        }

        ExporterHelpers.TrySetLength(instance, height, "Unconnected Height", "Column Height", "Height", "Length");
        ExporterHelpers.TrySetBuiltInLength(instance, BuiltInParameter.INSTANCE_LENGTH_PARAM, height);
    }

    private static Level? ResolveTopLevel(RevitExportContext context, Level baseLevel, double topElevation)
    {
        var tolerance = context.Mapper.ToInternalLength(0.002);
        var levels = context.LevelIdsBySourceId.Values
            .Concat(context.TopLevelIdsBySourceId.Values)
            .Distinct()
            .Select(id => context.Document.GetElement(id) as Level)
            .Where(level => level != null)
            .Cast<Level>()
            .OrderBy(level => level.Elevation)
            .ToList();
        return levels.FirstOrDefault(level => System.Math.Abs(level.Elevation - topElevation) <= tolerance)
            ?? levels.FirstOrDefault(level => level.Elevation > baseLevel.Elevation + tolerance);
    }

    private static bool TrySetElementId(Element element, BuiltInParameter builtInParameter, ElementId value)
    {
        var parameter = element.get_Parameter(builtInParameter);
        if (parameter == null || parameter.IsReadOnly || parameter.StorageType != StorageType.ElementId) return false;
        parameter.Set(value);
        return true;
    }

    private static FamilySymbol ResolveSizedType(RevitExportContext context, FamilySymbol symbol, RevitManifestElement source, bool isRound, double width, double depth)
    {
        var typeName = isRound
            ? $"MC_Column_Round_{FormatSize(context, width)}"
            : $"MC_Column_Rectangular_{FormatSize(context, width)}x{FormatSize(context, depth)}";
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

    private static string FormatSize(RevitExportContext context, double internalLength)
    {
        var meters = UnitUtils.ConvertFromInternalUnits(internalLength, UnitTypeId.Meters);
        if ((context.Manifest.Project.UnitSystem ?? "").ToLowerInvariant().Contains("imperial"))
        {
            return $"{System.Math.Round(meters / 0.0254)}in";
        }
        return $"{System.Math.Round(meters * 1000)}mm";
    }

    private static void RotateIfNeeded(RevitExportContext context, ElementId id, ManifestPoint point, double degrees)
    {
        if (System.Math.Abs(degrees) < 0.001) return;
        var origin = context.Mapper.ToRevitPoint(point);
        var axis = Line.CreateBound(origin, origin + XYZ.BasisZ);
        ElementTransformUtils.RotateElement(context.Document, id, axis, context.Mapper.ToRadians(degrees));
    }
}
