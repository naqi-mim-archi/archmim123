using System.Linq;
using Autodesk.Revit.DB;

namespace OurApp.RevitExportAddin;

public sealed class RevitValidationService
{
    public void Validate(RevitExportContext context)
    {
        context.Report.Validation["projectCreated"] = true;
        context.Report.Validation["levelCountCheck"] = context.LevelIdsBySourceId.Count > 0;
        context.Report.Validation["modelIsNotEmpty"] = context.ElementIdsBySourceId.Count > 0;
        context.Report.Validation["sourceElementCount"] = context.Manifest.Elements.Count;
        context.Report.Validation["mappedSourceElementCount"] = context.ElementIdsBySourceId.Count;
        context.Report.Validation["revitElementCount"] = context.ElementIdsListBySourceId.Values.Sum(ids => ids.Count);
        context.Report.Validation["sourceLevelCount"] = context.Manifest.Levels.Count;
        context.Report.Validation["revitLevelCount"] = context.LevelIdsBySourceId.Count + context.TopLevelIdsBySourceId.Values.Except(context.LevelIdsBySourceId.Values).Count();
        context.Report.Validation["levelElevationsMeters"] = context.Manifest.Levels
            .OrderBy(level => level.Order)
            .Select(level => $"{level.Name}:{level.Elevation}")
            .ToList();
        context.Report.Validation["levelHeightsMeters"] = context.Manifest.Levels
            .OrderBy(level => level.Order)
            .Select(level => $"{level.Name}:{level.Height}")
            .ToList();
        context.Report.Validation["generatedTopLevelsMeters"] = context.Manifest.Levels
            .OrderBy(level => level.Order)
            .Where(level => context.TopLevelIdsBySourceId.ContainsKey(level.Id))
            .Select(level => $"{level.Name}:top={level.Elevation + level.Height}")
            .ToList();
        context.Report.Validation["nativeWallCount"] = ClassCount(context, "Wall");
        context.Report.Validation["nativeFloorCount"] = ClassCount(context, "Floor");
        context.Report.Validation["nativeRoomCount"] = ClassCount(context, "Room");
        context.Report.Validation["nativeDoorCount"] = ClassCount(context, "Door");
        context.Report.Validation["nativeWindowCount"] = ClassCount(context, "Window");
        context.Report.Validation["nativeColumnCount"] = ClassCount(context, "Column");
        context.Report.Validation["nativeStairCount"] = ClassCount(context, "Stair");
        context.Report.Validation["nativeRailingCount"] = ClassCount(context, "Railing");
        context.Report.Validation["nativeCeilingCount"] = ClassCount(context, "Ceiling");
        context.Report.Validation["planAnnotationCount"] = context.Report.ClassCounts
            .Where(pair => pair.Key == "DetailCurve" || pair.Key == "TextNote" || pair.Key == "Grid")
            .Sum(pair => pair.Value);
        context.Report.Validation["fallbackCountBySourceType"] = context.Report.ElementMappings
            .Where(mapping => mapping.Result == "direct-shape")
            .GroupBy(mapping => mapping.SourceType)
            .ToDictionary(group => group.Key, group => group.Count());
        context.Report.Validation["doorWindowHostValidity"] = context.Manifest.Elements
            .Where(element => element.Type == "door" || element.Type == "window")
            .All(element => element.Relationships.String("hostWallId") != null && context.ElementIdsBySourceId.ContainsKey(element.Id));
        context.Report.Validation["wallOpeningHostValidity"] = context.Manifest.Elements
            .Where(element => element.Type == "wall-opening")
            .All(element => element.Relationships.String("hostWallId") != null && context.ElementIdsBySourceId.ContainsKey(element.Id));
        context.Report.Validation["windowSillTopHeightCheck"] = context.Manifest.Elements
            .Where(element => element.Type == "window")
            .All(element => element.Dimensions.Number("topHeight", 0) > element.Dimensions.Number("sillHeight", -1));
        context.Report.Validation["stairStepDirectionCheck"] = context.Manifest.Elements
            .Where(element => element.Type == "stair")
            .All(element => context.ElementIdsBySourceId.ContainsKey(element.Id) && element.Dimensions.Number("riserCount", 0) >= 1);
        context.Report.Validation["emptyInvalidRvtOutput"] = context.ElementIdsBySourceId.Count == 0;
        AddBoundingBoxValidation(context);
        if (context.LevelIdsBySourceId.Count == 0) context.Error("No Revit levels were created.");
        if (context.ElementIdsBySourceId.Count == 0) context.Error("No Revit model elements were created.");
        foreach (var source in context.Manifest.Elements)
        {
            if (source.ExportStrategy == "metadata-only" || source.Type == "group") continue;
            if (!context.Report.ElementMappings.Any(mapping => mapping.SourceElementId == source.Id))
            {
                context.Warn($"{source.Type} {source.Id} has no final element mapping in the RVT export report.");
            }
        }
    }

    private static int ClassCount(RevitExportContext context, string className)
    {
        return context.Report.ClassCounts.TryGetValue(className, out var count) ? count : 0;
    }

    private static void AddBoundingBoxValidation(RevitExportContext context)
    {
        var boxes = context.ElementIdsListBySourceId.Values
            .SelectMany(ids => ids)
            .Select(id => context.Document.GetElement(id)?.get_BoundingBox(null))
            .Where(box => box != null)
            .Cast<BoundingBoxXYZ>()
            .ToList();
        if (!boxes.Any())
        {
            context.Report.Validation["modelBoundingBoxMeters"] = "none";
            return;
        }
        var minX = boxes.Min(box => box.Min.X);
        var minY = boxes.Min(box => box.Min.Y);
        var minZ = boxes.Min(box => box.Min.Z);
        var maxX = boxes.Max(box => box.Max.X);
        var maxY = boxes.Max(box => box.Max.Y);
        var maxZ = boxes.Max(box => box.Max.Z);
        context.Report.Validation["modelBoundingBoxMeters"] = new
        {
            minX = UnitUtils.ConvertFromInternalUnits(minX, UnitTypeId.Meters),
            minY = UnitUtils.ConvertFromInternalUnits(minY, UnitTypeId.Meters),
            minZ = UnitUtils.ConvertFromInternalUnits(minZ, UnitTypeId.Meters),
            maxX = UnitUtils.ConvertFromInternalUnits(maxX, UnitTypeId.Meters),
            maxY = UnitUtils.ConvertFromInternalUnits(maxY, UnitTypeId.Meters),
            maxZ = UnitUtils.ConvertFromInternalUnits(maxZ, UnitTypeId.Meters),
        };
    }
}
