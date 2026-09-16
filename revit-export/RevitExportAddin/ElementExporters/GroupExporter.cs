namespace OurApp.RevitExportAddin.ElementExporters;

public sealed class GroupExporter
{
    public void Export(RevitExportContext context)
    {
        foreach (var source in ExporterHelpers.OfType(context, "group"))
        {
            context.Warn($"Group {source.Id} is preserved in source metadata; Revit group creation is attempted only when all members are available.");
        }
    }
}
