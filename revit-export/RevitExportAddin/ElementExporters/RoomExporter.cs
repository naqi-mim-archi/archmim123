using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;

namespace OurApp.RevitExportAddin.ElementExporters;

public sealed class RoomExporter
{
    public void Export(RevitExportContext context)
    {
        using var tx = new Transaction(context.Document, "Create OurApp Rooms");
        tx.Start();
        foreach (var source in ExporterHelpers.OfType(context, "room"))
        {
            try
            {
                var level = context.ResolveLevel(source.LevelId);
                var point = source.Geometry.Point("insertionPoint") ?? source.Geometry.Point("centroid");
                if (level == null || point == null)
                {
                    ExporterHelpers.MarkSkipped(context, source, "room level or placement point missing");
                    continue;
                }
                var room = context.Document.Create.NewRoom(level, new UV(
                    context.Mapper.ToInternalLength(point.Value.X),
                    context.Mapper.ToInternalLength(-point.Value.Y)));
                if (!string.IsNullOrWhiteSpace(source.Label))
                {
                    room.Name = source.Label;
                }
                var validation = room.Area > 1e-6 ? "room bounded" : "room placed but unbounded/open";
                if (room.Area <= 1e-6) context.Warn($"Room {source.Id} was placed but is unbounded or has zero area.");
                context.RegisterElement(source, room, "native", "Rooms", validation: validation);
                ExporterHelpers.Count(context, "Room", true);
            }
            catch (System.Exception ex)
            {
                ExporterHelpers.MarkSkipped(context, source, ex.Message);
            }
        }
        tx.Commit();
    }
}
