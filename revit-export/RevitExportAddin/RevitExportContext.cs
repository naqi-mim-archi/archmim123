using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;

namespace OurApp.RevitExportAddin;

public sealed class RevitExportContext
{
    public RevitExportContext(Document document, RevitExportManifest manifest, string reportPath)
    {
        Document = document;
        Manifest = manifest;
        ReportPath = reportPath;
        Mapper = new CoordinateMapper(manifest);
        Report = RevitExportReport.Create(manifest);
    }

    public Document Document { get; }
    public RevitExportManifest Manifest { get; }
    public string ReportPath { get; }
    public CoordinateMapper Mapper { get; }
    public RevitExportReport Report { get; }
    public Dictionary<string, ElementId> LevelIdsBySourceId { get; } = new();
    public Dictionary<string, ElementId> TopLevelIdsBySourceId { get; } = new();
    public Dictionary<string, ElementId> ElementIdsBySourceId { get; } = new();
    public Dictionary<string, string> UniqueIdsBySourceId { get; } = new();
    public Dictionary<string, List<ElementId>> ElementIdsListBySourceId { get; } = new();
    public List<(ElementId ElementId, RevitManifestElement Source)> PendingParameterWrites { get; } = new();

    public Level? ResolveLevel(string? sourceLevelId)
    {
        if (sourceLevelId != null && LevelIdsBySourceId.TryGetValue(sourceLevelId, out var levelId))
        {
            return Document.GetElement(levelId) as Level;
        }
        foreach (var value in LevelIdsBySourceId.Values)
        {
            if (Document.GetElement(value) is Level level) return level;
        }
        return null;
    }

    public void RegisterElement(RevitManifestElement source, Element element, string result, string category, string? warning = null, string? fallbackReason = null, string? validation = null)
    {
        RegisterElements(source, new List<Element> { element }, result, category, warning, fallbackReason, validation);
    }

    public void RegisterElements(RevitManifestElement source, IList<Element> elements, string result, string category, string? warning = null, string? fallbackReason = null, string? validation = null)
    {
        if (elements.Count == 0) return;
        ElementIdsBySourceId[source.Id] = elements[0].Id;
        UniqueIdsBySourceId[source.Id] = elements[0].UniqueId;
        ElementIdsListBySourceId[source.Id] = elements.Select(element => element.Id).ToList();
        foreach (var element in elements)
        {
            PendingParameterWrites.Add((element.Id, source));
        }
        Report.ElementMappings.Add(new RevitElementMapping
        {
            SourceElementId = source.Id,
            SourceType = source.SourceType,
            RevitElementId = elements[0].Id.Value.ToString(),
            RevitUniqueId = elements[0].UniqueId,
            RevitElementIds = elements.Select(element => element.Id.Value.ToString()).ToList(),
            RevitUniqueIds = elements.Select(element => element.UniqueId).ToList(),
            Result = result,
            RevitCategory = category,
            Warning = warning,
            FallbackReason = fallbackReason,
            Validation = validation,
        });
    }

    public bool IsRegistered(RevitManifestElement source) => ElementIdsBySourceId.ContainsKey(source.Id);

    public void Warn(string message)
    {
        Report.Warnings.Add(message);
    }

    public void Error(string message)
    {
        Report.Errors.Add(message);
    }
}
