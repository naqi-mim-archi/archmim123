using System.Collections.Generic;
using Autodesk.Revit.DB;

namespace OurApp.RevitExportAddin.ElementExporters;

public sealed class CeilingExporter
{
    public void Export(RevitExportContext context)
    {
        var typeResolver = new RevitTypeResolver();
        using var tx = new Transaction(context.Document, "Create OurApp Ceilings");
        tx.Start();
        foreach (var source in ExporterHelpers.OfType(context, "ceiling"))
        {
            try
            {
                var level = context.ResolveLevel(source.LevelId);
                var loop = ExporterHelpers.BoundaryLoop(context, source);
                var thickness = source.Dimensions.Number("thickness", 0.3);
                var ceilingType = typeResolver.CeilingTypeForThickness(context, thickness);
                if (level == null || loop == null || ceilingType == null)
                {
                    context.Warn($"Ceiling {source.Id} needs fallback because a level, ceiling type, or closed boundary was unavailable.");
                    continue;
                }
                var ceiling = Ceiling.Create(context.Document, new List<CurveLoop> { loop }, ceilingType.Id, level.Id);
                var elevation = source.Dimensions.Number("elevation", source.Dimensions.Number("height", 0));
                var requestedThickness = context.Mapper.ToInternalLength(thickness);
                var actualThickness = RevitTypeResolver.CompoundStructureThickness(ceilingType);
                if (actualThickness <= 0) actualThickness = requestedThickness;
                var offset = context.Mapper.ToInternalLength(elevation) - (actualThickness - requestedThickness);
                ExporterHelpers.TrySetLength(
                    ceiling,
                    offset,
                    "Height Offset From Level",
                    "Offset");
                var actualThicknessMeters = UnitUtils.ConvertFromInternalUnits(actualThickness, UnitTypeId.Meters);
                var offsetMeters = UnitUtils.ConvertFromInternalUnits(offset, UnitTypeId.Meters);
                context.RegisterElement(source, ceiling, "native", "Ceilings", validation: $"offset={offsetMeters:0.###}m; requestedThickness={thickness:0.###}m; actualTypeThickness={actualThicknessMeters:0.###}m; ceilingType={ceilingType.Name}; boundaryPoints={loop.NumberOfCurves()}");
                ExporterHelpers.Count(context, "Ceiling", true);
            }
            catch (System.Exception ex)
            {
                context.Warn($"Ceiling {source.Id} needs fallback: {ex.Message}");
            }
        }
        tx.Commit();
    }
}
