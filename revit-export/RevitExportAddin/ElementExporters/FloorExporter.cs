using System.Collections.Generic;
using Autodesk.Revit.DB;

namespace OurApp.RevitExportAddin.ElementExporters;

public sealed class FloorExporter
{
    public void Export(RevitExportContext context)
    {
        var typeResolver = new RevitTypeResolver();
        using var tx = new Transaction(context.Document, "Create OurApp Floors");
        tx.Start();
        foreach (var source in ExporterHelpers.OfType(context, "floor"))
        {
            try
            {
                var level = context.ResolveLevel(source.LevelId);
                var loop = ExporterHelpers.BoundaryLoop(context, source);
                var floorType = typeResolver.DefaultFloorType(context);
                if (level == null || loop == null || floorType == null)
                {
                    ExporterHelpers.MarkSkipped(context, source, "floor level, type, or closed boundary missing");
                    continue;
                }
                var floor = Floor.Create(context.Document, new List<CurveLoop> { loop }, floorType.Id, level.Id);
                ExporterHelpers.TrySetLength(
                    floor,
                    context.Mapper.ToInternalLength(source.Dimensions.Number("elevation", 0)),
                    "Height Offset From Level",
                    "Offset");
                context.RegisterElement(source, floor, "native", "Floors");
                ExporterHelpers.Count(context, "Floor", true);
            }
            catch (System.Exception ex)
            {
                ExporterHelpers.MarkSkipped(context, source, ex.Message);
            }
        }
        tx.Commit();
    }
}
