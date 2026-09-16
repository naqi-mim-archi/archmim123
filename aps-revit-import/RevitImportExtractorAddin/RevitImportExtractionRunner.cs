using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using Autodesk.Revit.ApplicationServices;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Architecture;
using DesignAutomationFramework;

namespace OurApp.RevitImportExtractorAddin;

public sealed class RevitImportExtractionRunner
{
    private const string ManifestVersion = "aps-revit-import-v1";
    private readonly List<string> _warnings = new();
    private readonly Dictionary<string, MaterialRecord> _materials = new();
    private ExtractOptions _options = new();

    public void Run(DesignAutomationData data)
    {
        var workDir = Directory.GetCurrentDirectory();
        var manifestPath = Path.Combine(workDir, "RevitExtractionManifest.json");
        var reportPath = Path.Combine(workDir, "RevitExtractionReport.json");
        var executionLogPath = Path.Combine(workDir, "APSRevitImport_Execution.log");
        var optionsPath = FindFile(workDir, "aps-revit-import-options.json") ?? FindFile(workDir, "options.json");
        _options = ReadOptions(optionsPath);

        var document = data.RevitDoc ?? OpenInputDocument(data.RevitApp, workDir);
        if (document == null) throw new InvalidOperationException("APS Revit Importer could not open the input RVT document.");

        var sourceFileName = FindInputRvtName(document, workDir);
        var levels = ExtractLevels(document);
        var views = ExtractPlanViews(document, levels);
        var selectedViews = SelectAnnotationViewsByLevel(document, views);
        var elements = new List<ElementRecord>();
        var seen = new HashSet<string>();

        if (_options.ImportModelElements)
        {
            foreach (var element in CollectModelElements(document))
            {
                AddElementRecord(document, element, null, elements, seen);
            }
        }

        if (_options.ImportPlanAnnotations)
        {
            foreach (var view in selectedViews)
            {
                ExtractViewAnnotations(document, view, elements, seen);
            }
        }

        var linkedModels = ExtractLinkedModels(document);
        if (linkedModels.Count > 0 && _options.IncludeLinkedModelReferencesAsWarnings)
        {
            foreach (var link in linkedModels)
            {
                _warnings.Add($"Linked model detected but not extracted as editable native elements: {link.Name}");
            }
        }

        var manifest = new ExtractionManifest
        {
            ManifestVersion = ManifestVersion,
            ExtractedAt = DateTime.UtcNow.ToString("O"),
            Source = new SourceRecord
            {
                FileName = sourceFileName,
                RevitVersion = data.RevitApp.VersionNumber,
                ProjectName = document.ProjectInformation?.Name ?? document.Title,
                Units = "feet",
                CoordinateSystem = "revit-internal",
            },
            Options = _options,
            Levels = levels,
            Views = views,
            Materials = _materials.Values.OrderBy(material => material.Name).ToList(),
            LinkedModels = linkedModels,
            Elements = elements,
            Warnings = _warnings,
        };

        WriteJson(manifestPath, manifest);
        WriteJson(reportPath, CreateReport(manifest));
        File.WriteAllLines(executionLogPath, new[]
        {
            $"OurApp APS Revit import extraction completed at {DateTime.UtcNow:O}.",
            $"Source file: {sourceFileName}",
            $"Revit version: {data.RevitApp.VersionNumber}",
            $"Levels: {levels.Count}",
            $"Views: {views.Count}",
            $"Selected annotation views: {selectedViews.Count}",
            $"Extracted elements: {elements.Count}",
            $"Materials: {_materials.Count}",
            $"Linked models: {linkedModels.Count}",
            $"Warnings: {_warnings.Count}",
        });
    }

    public static void WriteFailureReport(string path, Exception exception)
    {
        var report = new
        {
            importVersion = ManifestVersion,
            status = "failed",
            errors = new[] { exception.Message },
            stackTrace = exception.ToString(),
            writtenAt = DateTime.UtcNow.ToString("O"),
        };
        File.WriteAllText(path, JsonSerializer.Serialize(report, JsonOptions()));
    }

    private Document? OpenInputDocument(Application application, string workDir)
    {
        var inputPath = FindFile(workDir, "*.rvt");
        if (inputPath == null) return null;
        var openOptions = new OpenOptions
        {
            Audit = false,
            DetachFromCentralOption = DetachFromCentralOption.DetachAndPreserveWorksets,
        };
        return application.OpenDocumentFile(ModelPathUtils.ConvertUserVisiblePathToModelPath(inputPath), openOptions);
    }

    private static string FindInputRvtName(Document document, string workDir)
    {
        if (!string.IsNullOrWhiteSpace(document.PathName)) return Path.GetFileName(document.PathName);
        var inputPath = FindFile(workDir, "*.rvt");
        return inputPath == null ? $"{document.Title}.rvt" : Path.GetFileName(inputPath);
    }

    private static string? FindFile(string dir, string pattern)
    {
        foreach (var file in Directory.EnumerateFiles(dir, pattern, SearchOption.AllDirectories))
        {
            return file;
        }
        return null;
    }

    private static ExtractOptions ReadOptions(string? path)
    {
        var options = new ExtractOptions();
        if (path == null || !File.Exists(path)) return options;
        using var doc = JsonDocument.Parse(File.ReadAllText(path));
        var root = doc.RootElement;
        options.ImportModelElements = ReadBool(root, "importModelElements", options.ImportModelElements);
        options.ImportPlanAnnotations = ReadBool(root, "importPlanAnnotations", options.ImportPlanAnnotations);
        options.ImportDimensions = ReadBool(root, "importDimensions", options.ImportDimensions);
        options.ImportGenericFamiliesAsBlocks = ReadBool(root, "importGenericFamiliesAsBlocks", options.ImportGenericFamiliesAsBlocks);
        options.IncludeLinkedModelReferencesAsWarnings = ReadBool(root, "includeLinkedModelReferencesAsWarnings", options.IncludeLinkedModelReferencesAsWarnings);
        if (root.TryGetProperty("revitEngine", out var engine) && engine.ValueKind == JsonValueKind.String) options.RevitEngine = engine.GetString();
        return options;
    }

    private static bool ReadBool(JsonElement root, string name, bool fallback)
    {
        return root.TryGetProperty(name, out var value) && value.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? value.GetBoolean()
            : fallback;
    }

    private List<LevelRecord> ExtractLevels(Document document)
    {
        return new FilteredElementCollector(document)
            .OfClass(typeof(Level))
            .Cast<Level>()
            .OrderBy(level => level.Elevation)
            .ThenBy(level => level.Name)
            .Select((level, index) => new LevelRecord
            {
                ElementId = IdString(level.Id),
                UniqueId = level.UniqueId,
                Name = level.Name,
                Elevation = level.Elevation,
                Order = index,
                Parameters = ReadParameters(level),
            })
            .ToList();
    }

    private List<ViewRecord> ExtractPlanViews(Document document, List<LevelRecord> levels)
    {
        var levelIds = new HashSet<string>(levels.Select(level => level.ElementId));
        return new FilteredElementCollector(document)
            .OfClass(typeof(ViewPlan))
            .Cast<ViewPlan>()
            .Where(view => view.ViewType == ViewType.FloorPlan || view.ViewType == ViewType.CeilingPlan || view.ViewType == ViewType.EngineeringPlan)
            .Select(view =>
            {
                var level = view.GenLevel;
                return new ViewRecord
                {
                    ElementId = IdString(view.Id),
                    UniqueId = view.UniqueId,
                    Name = view.Name,
                    ViewType = view.ViewType.ToString(),
                    LevelElementId = level == null || level.Id == ElementId.InvalidElementId ? null : IdString(level.Id),
                    LevelUniqueId = level?.UniqueId,
                    LevelName = level?.Name,
                    IsTemplate = view.IsTemplate,
                    SelectedForAnnotations = false,
                    IgnoredReason = view.IsTemplate ? "Template view" : level == null || !levelIds.Contains(IdString(level.Id)) ? "No associated extracted level" : null,
                };
            })
            .OrderBy(view => view.LevelName)
            .ThenBy(view => view.Name)
            .ToList();
    }

    private List<ViewPlan> SelectAnnotationViewsByLevel(Document document, List<ViewRecord> views)
    {
        var selected = new List<ViewPlan>();
        var grouped = views
            .Where(view => view.IgnoredReason == null && !view.IsTemplate && !string.IsNullOrWhiteSpace(view.LevelElementId))
            .GroupBy(view => view.LevelElementId!);
        foreach (var group in grouped)
        {
            var preferred = group
                .OrderBy(view => PlanViewScore(view))
                .FirstOrDefault();
            if (preferred == null) continue;
            preferred.SelectedForAnnotations = true;
            foreach (var ignored in group.Where(view => view.ElementId != preferred.ElementId))
            {
                ignored.IgnoredReason = $"Ignored to avoid duplicate annotations; selected {preferred.Name}.";
            }
            if (document.GetElement(ElementIdFromString(preferred.ElementId)) is ViewPlan viewPlan)
            {
                selected.Add(viewPlan);
            }
        }
        return selected;
    }

    private static int PlanViewScore(ViewRecord view)
    {
        var name = (view.Name ?? "").ToLowerInvariant();
        var level = (view.LevelName ?? "").ToLowerInvariant();
        var score = 0;
        if (view.ViewType == ViewType.FloorPlan.ToString()) score -= 100;
        if (name == level || name.Contains(level)) score -= 50;
        if (name.Contains("site") || name.Contains("template") || name.Contains("ceiling")) score += 50;
        return score;
    }

    private IEnumerable<Element> CollectModelElements(Document document)
    {
        var categories = new[]
        {
            BuiltInCategory.OST_Walls,
            BuiltInCategory.OST_Doors,
            BuiltInCategory.OST_Windows,
            BuiltInCategory.OST_Floors,
            BuiltInCategory.OST_Ceilings,
            BuiltInCategory.OST_Rooms,
            BuiltInCategory.OST_Columns,
            BuiltInCategory.OST_StructuralColumns,
            BuiltInCategory.OST_Stairs,
            BuiltInCategory.OST_StairsRuns,
            BuiltInCategory.OST_StairsLandings,
            BuiltInCategory.OST_Railings,
            BuiltInCategory.OST_Grids,
            BuiltInCategory.OST_GenericModel,
            BuiltInCategory.OST_Furniture,
            BuiltInCategory.OST_Casework,
            BuiltInCategory.OST_PlumbingFixtures,
            BuiltInCategory.OST_MechanicalEquipment,
            BuiltInCategory.OST_LightingFixtures,
            BuiltInCategory.OST_SpecialityEquipment,
            BuiltInCategory.OST_CurtainWallPanels,
            BuiltInCategory.OST_CurtainWallMullions,
            BuiltInCategory.OST_Lines,
        };
        var filter = new ElementMulticategoryFilter(categories.ToList());
        return new FilteredElementCollector(document)
            .WherePasses(filter)
            .WhereElementIsNotElementType()
            .Where(element => element.Category != null)
            .Where(IsModelElementForImport);
    }

    private static bool IsModelElementForImport(Element element)
    {
        if (IsViewOnlyDetailCurve(element))
        {
            return false;
        }
        return true;
    }

    private static bool IsViewOnlyDetailCurve(Element element)
    {
        return element is CurveElement
            && element.OwnerViewId != ElementId.InvalidElementId
            && IsBuiltInCategory(element, BuiltInCategory.OST_Lines);
    }

    private List<LinkedModelRecord> ExtractLinkedModels(Document document)
    {
        return new FilteredElementCollector(document)
            .OfClass(typeof(RevitLinkInstance))
            .Cast<RevitLinkInstance>()
            .Select(link =>
            {
                var linkDoc = link.GetLinkDocument();
                return new LinkedModelRecord
                {
                    ElementId = IdString(link.Id),
                    UniqueId = link.UniqueId,
                    Name = link.Name,
                    Path = linkDoc?.PathName,
                    Loaded = linkDoc != null,
                };
            })
            .ToList();
    }

    private void ExtractViewAnnotations(Document document, ViewPlan view, List<ElementRecord> elements, HashSet<string> seen)
    {
        var categories = _options.ImportDimensions
            ? new[] { BuiltInCategory.OST_Lines, BuiltInCategory.OST_TextNotes, BuiltInCategory.OST_Dimensions }
            : new[] { BuiltInCategory.OST_Lines, BuiltInCategory.OST_TextNotes };
        var filter = new ElementMulticategoryFilter(categories.ToList());
        foreach (var element in new FilteredElementCollector(document, view.Id).WherePasses(filter).WhereElementIsNotElementType())
        {
            if (element.OwnerViewId == ElementId.InvalidElementId || element.OwnerViewId != view.Id) continue;
            if (IsViewOnlyDetailCurve(element)) continue;
            AddElementRecord(document, element, view, elements, seen);
        }
    }

    private void AddElementRecord(Document document, Element element, View? sourceView, List<ElementRecord> elements, HashSet<string> seen)
    {
        var recordId = sourceView == null ? IdString(element.Id) : $"{IdString(element.Id)}@{IdString(sourceView.Id)}";
        if (!seen.Add(recordId)) return;
        try
        {
            var record = CreateElementRecord(document, element, sourceView);
            if (record != null) elements.Add(record);
        }
        catch (Exception ex)
        {
            _warnings.Add($"Could not extract element {IdString(element.Id)} {element.Name}: {ex.Message}");
        }
    }

    private ElementRecord? CreateElementRecord(Document document, Element element, View? sourceView)
    {
        var category = element.Category?.Name ?? element.GetType().Name;
        var builtInCategory = TryGetBuiltInCategory(element);
        var type = document.GetElement(element.GetTypeId()) as ElementType;
        var familyInstance = element as FamilyInstance;
        var symbol = familyInstance?.Symbol;
        var geometry = ExtractGeometry(document, element, sourceView);
        var parameters = ReadParameters(element);
        var ourAppParameters = parameters
            .Where(pair => pair.Key.StartsWith("OurApp_", StringComparison.OrdinalIgnoreCase))
            .ToDictionary(pair => pair.Key, pair => pair.Value);
        var levelId = ResolveLevelId(element, parameters);
        var level = levelId == null ? null : document.GetElement(ElementIdFromString(levelId)) as Level;
        var materialIds = ReadMaterialIds(element);

        return new ElementRecord
        {
            ElementId = IdString(element.Id),
            UniqueId = element.UniqueId,
            Category = category,
            BuiltInCategory = builtInCategory,
            ClassName = element.GetType().Name,
            Name = element.Name,
            FamilyName = symbol?.Family?.Name ?? type?.FamilyName,
            TypeName = symbol?.Name ?? type?.Name,
            TypeId = element.GetTypeId() == ElementId.InvalidElementId ? null : IdString(element.GetTypeId()),
            TypeUniqueId = type?.UniqueId,
            LevelElementId = levelId,
            LevelUniqueId = level?.UniqueId,
            LevelName = level?.Name,
            HostElementId = familyInstance?.Host == null ? null : IdString(familyInstance.Host.Id),
            HostUniqueId = familyInstance?.Host?.UniqueId,
            MaterialIds = materialIds.Select(IdString).ToList(),
            MaterialNames = materialIds.Select(id => _materials.TryGetValue(IdString(id), out var material) ? material.Name : null).Where(name => name != null).Cast<string>().ToList(),
            Parameters = parameters,
            OurAppParameters = ourAppParameters,
            Geometry = geometry,
            SourceViewId = sourceView == null ? null : IdString(sourceView.Id),
            SourceViewName = sourceView?.Name,
            IsAnnotation = sourceView != null || element is TextNote || element is Dimension || element is CurveElement,
            Warnings = geometry.Warnings,
        };
    }

    private GeometryRecord ExtractGeometry(Document document, Element element, View? sourceView)
    {
        var geometry = new GeometryRecord();
        var warnings = geometry.Warnings;
        var location = element.Location;
        if (location is LocationPoint locationPoint)
        {
            geometry.LocationPoint = PointRecord.From(locationPoint.Point);
            geometry.Rotation = locationPoint.Rotation;
        }
        else if (location is LocationCurve locationCurve)
        {
            geometry.LocationCurve = CurveRecord.From(locationCurve.Curve, warnings);
        }

        var bbox = element.get_BoundingBox(sourceView);
        if (bbox != null)
        {
            geometry.BoundingBox = BoundingBoxRecord.From(bbox);
            geometry.Width = Math.Abs(bbox.Max.X - bbox.Min.X);
            geometry.Depth = Math.Abs(bbox.Max.Y - bbox.Min.Y);
            geometry.Height = Math.Abs(bbox.Max.Z - bbox.Min.Z);
        }

        switch (element)
        {
            case Wall wall:
                geometry.Thickness = wall.Width;
                geometry.LocationCurve ??= CurveRecord.From((wall.Location as LocationCurve)?.Curve, warnings);
                geometry.Height = ReadDoubleParameter(wall, BuiltInParameter.WALL_USER_HEIGHT_PARAM) ?? geometry.Height;
                break;
            case Room room:
                geometry.BoundaryLoops = ExtractRoomBoundary(room);
                geometry.LocationPoint = room.Location is LocationPoint roomLocation ? PointRecord.From(roomLocation.Point) : geometry.LocationPoint;
                geometry.Area = room.Area;
                geometry.Height = ReadDoubleParameter(room, BuiltInParameter.ROOM_HEIGHT) ?? geometry.Height;
                break;
            case Floor:
            case Ceiling:
                geometry.BoundaryLoops = ExtractHorizontalFaceLoops(element, warnings);
                geometry.Thickness = ReadDoubleParameter(element, BuiltInParameter.FLOOR_ATTR_THICKNESS_PARAM) ?? geometry.Height;
                break;
            case Grid grid:
                geometry.LocationCurve = CurveRecord.From(grid.Curve, warnings);
                break;
            case CurveElement curveElement:
                geometry.Curves = new List<CurveRecord> { CurveRecord.From(curveElement.GeometryCurve, warnings) };
                geometry.SourceViewId = sourceView == null ? null : IdString(sourceView.Id);
                geometry.SourceViewName = sourceView?.Name;
                break;
            case TextNote textNote:
                geometry.Text = textNote.Text;
                geometry.LocationPoint = PointRecord.From(textNote.Coord);
                geometry.Rotation = Math.Atan2(textNote.BaseDirection.Y, textNote.BaseDirection.X);
                geometry.Width = textNote.Width;
                geometry.SourceViewId = sourceView == null ? null : IdString(sourceView.Id);
                geometry.SourceViewName = sourceView?.Name;
                break;
            case Dimension dimension:
                geometry.ValueText = dimension.ValueString;
                if (dimension.Curve != null) geometry.Curves = new List<CurveRecord> { CurveRecord.From(dimension.Curve, warnings) };
                geometry.SourceViewId = sourceView == null ? null : IdString(sourceView.Id);
                geometry.SourceViewName = sourceView?.Name;
                break;
            case FamilyInstance familyInstance:
                geometry.Rotation ??= familyInstance.Location is LocationPoint lp ? lp.Rotation : null;
                geometry.ShapeHint = InferShapeHint(familyInstance, geometry);
                geometry.Width = ReadFamilySize(familyInstance, "Width", "Rough Width", "Diameter") ?? geometry.Width;
                geometry.Depth = ReadFamilySize(familyInstance, "Depth", "Length") ?? geometry.Depth;
                geometry.Height = ReadFamilySize(familyInstance, "Height", "Rough Height") ?? geometry.Height;
                break;
        }

        if (IsBuiltInCategory(element, BuiltInCategory.OST_Stairs))
        {
            geometry.Path = PathFromBoundingBox(geometry.BoundingBox);
            geometry.Width = element is Stairs stairs
                ? ReadStairRunWidth(document, stairs) ?? SmallestHorizontalSpan(geometry.BoundingBox) ?? geometry.Width
                : SmallestHorizontalSpan(geometry.BoundingBox) ?? geometry.Width;
        }
        if (IsBuiltInCategory(element, BuiltInCategory.OST_Railings))
        {
            geometry.Path = geometry.LocationCurve == null ? PathFromBoundingBox(geometry.BoundingBox) : new List<CurveRecord> { geometry.LocationCurve };
        }

        return geometry;
    }

    private static string? InferShapeHint(FamilyInstance instance, GeometryRecord geometry)
    {
        var text = $"{instance.Symbol?.Family?.Name} {instance.Symbol?.Name} {instance.Name}".ToLowerInvariant();
        if (text.Contains("round") || text.Contains("circular") || text.Contains("circle") || text.Contains("diameter")) return "circle";
        if (geometry.Width.HasValue && geometry.Depth.HasValue && Math.Abs(geometry.Width.Value - geometry.Depth.Value) < 0.001 && text.Contains("column")) return "rect";
        return null;
    }

    private static List<CurveRecord>? PathFromBoundingBox(BoundingBoxRecord? bbox)
    {
        if (bbox == null) return null;
        var spanX = Math.Abs(bbox.Max.X - bbox.Min.X);
        var spanY = Math.Abs(bbox.Max.Y - bbox.Min.Y);
        var z = bbox.Min.Z;
        if (spanX >= spanY)
        {
            var y = (bbox.Min.Y + bbox.Max.Y) / 2.0;
            return new List<CurveRecord>
            {
                new()
                {
                    Kind = "line",
                    Start = new PointRecord(bbox.Min.X, y, z),
                    End = new PointRecord(bbox.Max.X, y, z),
                },
            };
        }
        else
        {
            var x = (bbox.Min.X + bbox.Max.X) / 2.0;
            return new List<CurveRecord>
            {
                new()
                {
                    Kind = "line",
                    Start = new PointRecord(x, bbox.Min.Y, z),
                    End = new PointRecord(x, bbox.Max.Y, z),
                },
            };
        }
    }

    private static double? SmallestHorizontalSpan(BoundingBoxRecord? bbox)
    {
        if (bbox == null) return null;
        var spanX = Math.Abs(bbox.Max.X - bbox.Min.X);
        var spanY = Math.Abs(bbox.Max.Y - bbox.Min.Y);
        if (spanX <= 0 || spanY <= 0) return null;
        return Math.Min(spanX, spanY);
    }

    private List<List<PointRecord>> ExtractRoomBoundary(Room room)
    {
        var loops = new List<List<PointRecord>>();
        var options = new SpatialElementBoundaryOptions
        {
            SpatialElementBoundaryLocation = SpatialElementBoundaryLocation.Finish,
        };
        var boundaries = room.GetBoundarySegments(options);
        if (boundaries == null) return loops;
        foreach (var boundary in boundaries)
        {
            var points = new List<PointRecord>();
            foreach (var segment in boundary)
            {
                AddCurvePoints(points, segment.GetCurve());
            }
            AddClosedLoop(loops, points);
        }
        return loops;
    }

    private List<List<PointRecord>> ExtractHorizontalFaceLoops(Element element, List<string> warnings)
    {
        var loops = new List<List<PointRecord>>();
        var options = new Options
        {
            DetailLevel = ViewDetailLevel.Fine,
            IncludeNonVisibleObjects = false,
        };
        var geometry = element.get_Geometry(options);
        if (geometry == null) return loops;
        PlanarFace? bestFace = null;
        double bestArea = 0;
        foreach (var solid in FlattenSolids(geometry))
        {
            foreach (Face face in solid.Faces)
            {
                if (face is not PlanarFace planar) continue;
                if (Math.Abs(planar.FaceNormal.Z) < 0.85) continue;
                if (planar.Area <= bestArea) continue;
                bestFace = planar;
                bestArea = planar.Area;
            }
        }
        if (bestFace == null)
        {
            warnings.Add("No horizontal planar face loop was available for boundary reconstruction.");
            return loops;
        }
        foreach (EdgeArray edgeArray in bestFace.EdgeLoops)
        {
            var points = new List<PointRecord>();
            foreach (Edge edge in edgeArray)
            {
                AddCurvePoints(points, edge.AsCurve());
            }
            AddClosedLoop(loops, points);
        }
        return loops;
    }

    private static IEnumerable<Solid> FlattenSolids(GeometryElement geometry)
    {
        foreach (var item in geometry)
        {
            switch (item)
            {
                case Solid solid when solid.Volume > 1e-9:
                    yield return solid;
                    break;
                case GeometryInstance instance:
                    foreach (var nested in FlattenSolids(instance.GetInstanceGeometry()))
                    {
                        yield return nested;
                    }
                    break;
            }
        }
    }

    private static void AddCurvePoints(List<PointRecord> points, Curve? curve)
    {
        if (curve == null) return;
        IList<XYZ> tessellated;
        try
        {
            tessellated = curve.Tessellate();
        }
        catch
        {
            return;
        }
        foreach (var xyz in tessellated)
        {
            AddPoint(points, PointRecord.From(xyz));
        }
    }

    private static void AddClosedLoop(List<List<PointRecord>> loops, List<PointRecord> points)
    {
        if (points.Count < 3) return;
        if (Distance(points[0], points[^1]) > 1e-6) points.Add(points[0]);
        loops.Add(points);
    }

    private static void AddPoint(List<PointRecord> points, PointRecord point)
    {
        if (points.Count > 0 && Distance(points[^1], point) < 1e-6) return;
        points.Add(point);
    }

    private static double Distance(PointRecord a, PointRecord b)
    {
        var dx = a.X - b.X;
        var dy = a.Y - b.Y;
        var dz = (a.Z ?? 0) - (b.Z ?? 0);
        return Math.Sqrt(dx * dx + dy * dy + dz * dz);
    }

    private List<ElementId> ReadMaterialIds(Element element)
    {
        try
        {
            var ids = element.GetMaterialIds(false).ToList();
            foreach (var id in ids)
            {
                if (element.Document.GetElement(id) is Material material)
                {
                    _materials[IdString(id)] = new MaterialRecord
                    {
                        ElementId = IdString(id),
                        UniqueId = material.UniqueId,
                        Name = material.Name,
                        Color = material.Color.IsValid ? $"#{material.Color.Red:X2}{material.Color.Green:X2}{material.Color.Blue:X2}" : null,
                        Transparency = material.Transparency,
                    };
                }
            }
            return ids;
        }
        catch
        {
            return new List<ElementId>();
        }
    }

    private static double? ReadFamilySize(FamilyInstance instance, params string[] names)
    {
        foreach (var name in names)
        {
            var parameter = instance.LookupParameter(name) ?? instance.Symbol?.LookupParameter(name);
            if (parameter != null && parameter.StorageType == StorageType.Double) return parameter.AsDouble();
        }
        return null;
    }

    private static double? ReadStairRunWidth(Document document, Stairs stairs)
    {
        try
        {
            var widths = stairs.GetStairsRuns()
                .Select(id => document.GetElement(id))
                .Where(element => element != null)
                .Select(element => ReadNamedDoubleParameter(element!, "Actual Run Width", "Run Width", "Width"))
                .Where(width => width.HasValue && width.Value > 0)
                .Select(width => width!.Value)
                .ToList();
            return widths.Count == 0 ? null : widths.Max();
        }
        catch
        {
            return null;
        }
    }

    private static double? ReadNamedDoubleParameter(Element element, params string[] names)
    {
        foreach (var name in names)
        {
            var parameter = element.LookupParameter(name);
            if (parameter != null && parameter.StorageType == StorageType.Double) return parameter.AsDouble();
        }
        return null;
    }

    private static double? ReadDoubleParameter(Element element, BuiltInParameter parameterId)
    {
        var parameter = element.get_Parameter(parameterId);
        return parameter != null && parameter.StorageType == StorageType.Double ? parameter.AsDouble() : null;
    }

    private static string? ResolveLevelId(Element element, Dictionary<string, object?> parameters)
    {
        if (element.LevelId != ElementId.InvalidElementId) return IdString(element.LevelId);
        foreach (var key in new[] { "Level", "Base Constraint", "Base Level", "Schedule Level" })
        {
            if (parameters.TryGetValue(key, out var value) && value is Dictionary<string, object?> nested && nested.TryGetValue("elementId", out var id) && id != null)
            {
                return Convert.ToString(id);
            }
        }
        return null;
    }

    private static Dictionary<string, object?> ReadParameters(Element element)
    {
        var values = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        foreach (Parameter parameter in element.Parameters)
        {
            var name = parameter.Definition?.Name;
            if (string.IsNullOrWhiteSpace(name) || values.ContainsKey(name)) continue;
            values[name] = ReadParameterValue(parameter);
        }
        return values;
    }

    private static object? ReadParameterValue(Parameter parameter)
    {
        try
        {
            return parameter.StorageType switch
            {
                StorageType.Double => parameter.AsDouble(),
                StorageType.Integer => parameter.AsInteger(),
                StorageType.String => parameter.AsString(),
                StorageType.ElementId => new Dictionary<string, object?>
                {
                    ["elementId"] = IdString(parameter.AsElementId()),
                    ["displayValue"] = parameter.AsValueString(),
                },
                _ => parameter.AsValueString(),
            };
        }
        catch
        {
            return null;
        }
    }

    private static string? TryGetBuiltInCategory(Element element)
    {
        try
        {
            if (element.Category == null) return null;
            return ((BuiltInCategory)(int)element.Category.Id.Value).ToString();
        }
        catch
        {
            return null;
        }
    }

    private static bool IsBuiltInCategory(Element element, BuiltInCategory category)
    {
        try
        {
            return element.Category != null && (BuiltInCategory)(int)element.Category.Id.Value == category;
        }
        catch
        {
            return false;
        }
    }

    private object CreateReport(ExtractionManifest manifest)
    {
        var sourceCounts = manifest.Elements
            .GroupBy(element => element.Category)
            .OrderBy(group => group.Key)
            .ToDictionary(group => group.Key, group => group.Count());
        return new
        {
            importVersion = ManifestVersion,
            status = "completed",
            source = manifest.Source,
            selectedRevitEngine = _options.RevitEngine,
            levelCount = manifest.Levels.Count,
            viewCount = manifest.Views.Count,
            selectedPlanViews = manifest.Views.Where(view => view.SelectedForAnnotations).ToList(),
            ignoredPlanViews = manifest.Views.Where(view => !view.SelectedForAnnotations).ToList(),
            extractedElementCount = manifest.Elements.Count,
            sourceCategoryCounts = sourceCounts,
            linkedModels = manifest.LinkedModels,
            warnings = _warnings,
            errors = Array.Empty<string>(),
            validation = new
            {
                openedDocument = true,
                wroteManifest = true,
                usedRevitDbApi = true,
                generatedRuntimeIntermediates = new[] { "RevitExtractionManifest.json", "RevitExtractionReport.json", "APSRevitImport_Execution.log" },
            },
        };
    }

    private static void WriteJson<T>(string path, T value)
    {
        File.WriteAllText(path, JsonSerializer.Serialize(value, JsonOptions()));
    }

    private static JsonSerializerOptions JsonOptions()
    {
        return new JsonSerializerOptions
        {
            WriteIndented = true,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        };
    }

    private static string IdString(ElementId id)
    {
        return id == ElementId.InvalidElementId ? "" : id.Value.ToString();
    }

    private static ElementId ElementIdFromString(string value)
    {
        return long.TryParse(value, out var id) ? new ElementId(id) : ElementId.InvalidElementId;
    }
}

public sealed class ExtractOptions
{
    public bool ImportModelElements { get; set; } = true;
    public bool ImportPlanAnnotations { get; set; } = true;
    public bool ImportDimensions { get; set; } = true;
    public bool ImportGenericFamiliesAsBlocks { get; set; } = true;
    public bool IncludeLinkedModelReferencesAsWarnings { get; set; } = true;
    public string? RevitEngine { get; set; }
}

public sealed class ExtractionManifest
{
    public string ManifestVersion { get; set; } = "";
    public string ExtractedAt { get; set; } = "";
    public SourceRecord Source { get; set; } = new();
    public ExtractOptions Options { get; set; } = new();
    public List<LevelRecord> Levels { get; set; } = new();
    public List<ViewRecord> Views { get; set; } = new();
    public List<MaterialRecord> Materials { get; set; } = new();
    public List<LinkedModelRecord> LinkedModels { get; set; } = new();
    public List<ElementRecord> Elements { get; set; } = new();
    public List<string> Warnings { get; set; } = new();
}

public sealed class SourceRecord
{
    public string FileName { get; set; } = "";
    public string? RevitVersion { get; set; }
    public string? ProjectName { get; set; }
    public string Units { get; set; } = "feet";
    public string CoordinateSystem { get; set; } = "revit-internal";
}

public sealed class LevelRecord
{
    public string ElementId { get; set; } = "";
    public string? UniqueId { get; set; }
    public string Name { get; set; } = "";
    public double Elevation { get; set; }
    public int Order { get; set; }
    public Dictionary<string, object?> Parameters { get; set; } = new();
}

public sealed class ViewRecord
{
    public string ElementId { get; set; } = "";
    public string? UniqueId { get; set; }
    public string Name { get; set; } = "";
    public string ViewType { get; set; } = "";
    public string? LevelElementId { get; set; }
    public string? LevelUniqueId { get; set; }
    public string? LevelName { get; set; }
    public bool IsTemplate { get; set; }
    public bool SelectedForAnnotations { get; set; }
    public string? IgnoredReason { get; set; }
}

public sealed class MaterialRecord
{
    public string ElementId { get; set; } = "";
    public string? UniqueId { get; set; }
    public string Name { get; set; } = "";
    public string? Color { get; set; }
    public int? Transparency { get; set; }
}

public sealed class LinkedModelRecord
{
    public string? ElementId { get; set; }
    public string? UniqueId { get; set; }
    public string Name { get; set; } = "";
    public string? Path { get; set; }
    public bool Loaded { get; set; }
}

public sealed class ElementRecord
{
    public string ElementId { get; set; } = "";
    public string? UniqueId { get; set; }
    public string Category { get; set; } = "";
    public string? BuiltInCategory { get; set; }
    public string? ClassName { get; set; }
    public string? Name { get; set; }
    public string? FamilyName { get; set; }
    public string? TypeName { get; set; }
    public string? TypeId { get; set; }
    public string? TypeUniqueId { get; set; }
    public string? LevelElementId { get; set; }
    public string? LevelUniqueId { get; set; }
    public string? LevelName { get; set; }
    public string? HostElementId { get; set; }
    public string? HostUniqueId { get; set; }
    public List<string> MaterialIds { get; set; } = new();
    public List<string> MaterialNames { get; set; } = new();
    public Dictionary<string, object?> Parameters { get; set; } = new();
    public Dictionary<string, object?> OurAppParameters { get; set; } = new();
    public GeometryRecord Geometry { get; set; } = new();
    public string? SourceViewId { get; set; }
    public string? SourceViewName { get; set; }
    public bool IsAnnotation { get; set; }
    public bool IsLinkedElement { get; set; }
    public List<string> Warnings { get; set; } = new();
}

public sealed class GeometryRecord
{
    public PointRecord? LocationPoint { get; set; }
    public CurveRecord? LocationCurve { get; set; }
    public List<CurveRecord>? Curves { get; set; }
    public List<CurveRecord>? Path { get; set; }
    public List<List<PointRecord>>? BoundaryLoops { get; set; }
    public List<List<PointRecord>>? Holes { get; set; }
    public List<PointRecord>? Footprint { get; set; }
    public BoundingBoxRecord? BoundingBox { get; set; }
    public double? Rotation { get; set; }
    public double? Width { get; set; }
    public double? Depth { get; set; }
    public double? Height { get; set; }
    public double? Thickness { get; set; }
    public double? Diameter { get; set; }
    public double? Area { get; set; }
    public double? Volume { get; set; }
    public string? Text { get; set; }
    public string? ValueText { get; set; }
    public string? Alignment { get; set; }
    public string? SourceViewId { get; set; }
    public string? SourceViewName { get; set; }
    public string? ShapeHint { get; set; }
    public List<string> Warnings { get; set; } = new();
}

public sealed class BoundingBoxRecord
{
    public PointRecord Min { get; set; } = new();
    public PointRecord Max { get; set; } = new();

    public static BoundingBoxRecord From(BoundingBoxXYZ bbox)
    {
        return new BoundingBoxRecord
        {
            Min = PointRecord.From(bbox.Min),
            Max = PointRecord.From(bbox.Max),
        };
    }
}

public sealed class CurveRecord
{
    private const double CurveEpsilon = 1e-8;
    private const double TwoPi = Math.PI * 2.0;

    public string Kind { get; set; } = "unknown";
    public PointRecord? Start { get; set; }
    public PointRecord? End { get; set; }
    public PointRecord? Center { get; set; }
    public PointRecord? Mid { get; set; }
    public PointRecord? Normal { get; set; }
    public PointRecord? XDirection { get; set; }
    public PointRecord? YDirection { get; set; }
    public double? Radius { get; set; }
    public double? RadiusX { get; set; }
    public double? RadiusY { get; set; }
    public double? StartAngle { get; set; }
    public double? EndAngle { get; set; }
    public double? Rotation { get; set; }
    public List<PointRecord>? Points { get; set; }
    public bool? IsBound { get; set; }
    public string? Warning { get; set; }

    public static CurveRecord From(Curve? curve, List<string> warnings)
    {
        if (curve == null)
        {
            return new CurveRecord { Kind = "unknown", Warning = "Curve was null." };
        }

        var record = new CurveRecord { IsBound = curve.IsBound };
        try
        {
            if (curve is Line line)
            {
                record.Kind = "line";
                record.Start = PointRecord.From(line.GetEndPoint(0));
                record.End = PointRecord.From(line.GetEndPoint(1));
            }
            else if (curve is Arc arc)
            {
                record.Start = SafeEndPoint(arc, 0);
                record.End = SafeEndPoint(arc, 1);
                record.Center = PointRecord.From(arc.Center);
                record.Mid = curve.IsBound ? SafeEvaluate(arc, 0.5, true) : null;
                record.Normal = PointRecord.From(arc.Normal);
                record.XDirection = SafeCurveVectorProperty(arc, "XDirection");
                record.YDirection = SafeCurveVectorProperty(arc, "YDirection");
                record.Radius = arc.Radius;
                record.StartAngle = curve.IsBound ? SafeParameter(arc, 0) : null;
                record.EndAngle = curve.IsBound ? SafeParameter(arc, 1) : null;
                record.Kind = IsFullCircle(record.Start, record.End, record.StartAngle, record.EndAngle, curve.IsBound)
                    ? "circle"
                    : "arc";
            }
            else if (curve is Ellipse ellipse)
            {
                record.Kind = "ellipse";
                record.Start = SafeEndPoint(ellipse, 0);
                record.End = SafeEndPoint(ellipse, 1);
                record.Center = PointRecord.From(ellipse.Center);
                record.Mid = curve.IsBound ? SafeEvaluate(ellipse, 0.5, true) : null;
                record.XDirection = SafeCurveVectorProperty(ellipse, "XDirection");
                record.YDirection = SafeCurveVectorProperty(ellipse, "YDirection");
                record.RadiusX = ellipse.RadiusX;
                record.RadiusY = ellipse.RadiusY;
                if (record.XDirection != null)
                {
                    record.Rotation = Math.Atan2(record.XDirection.Y, record.XDirection.X);
                }
                record.StartAngle = curve.IsBound ? SafeParameter(ellipse, 0) : null;
                record.EndAngle = curve.IsBound ? SafeParameter(ellipse, 1) : null;
            }
            else
            {
                record.Kind = curve is NurbSpline or HermiteSpline ? "spline" : "polyline";
                record.Points = curve.Tessellate().Select(PointRecord.From).ToList();
                if (record.Points.Count >= 2)
                {
                    record.Start = record.Points[0];
                    record.End = record.Points[^1];
                }
            }
        }
        catch (Exception ex)
        {
            record.Kind = "unknown";
            record.Warning = ex.Message;
            warnings.Add($"Could not serialize curve: {ex.Message}");
        }
        return record;
    }

    private static bool IsFullCircle(PointRecord? start, PointRecord? end, double? startAngle, double? endAngle, bool isBound)
    {
        if (!isBound) return true;
        if (start == null || end == null) return true;
        var chord = Math.Sqrt(Math.Pow(start.X - end.X, 2) + Math.Pow(start.Y - end.Y, 2) + Math.Pow((start.Z ?? 0) - (end.Z ?? 0), 2));
        if (chord <= CurveEpsilon) return true;
        if (startAngle.HasValue && endAngle.HasValue)
        {
            var span = Math.Abs(endAngle.Value - startAngle.Value);
            if (Math.Abs(span - TwoPi) <= CurveEpsilon) return true;
        }
        return false;
    }

    private static PointRecord? SafeEvaluate(Curve curve, double parameter, bool normalized)
    {
        try
        {
            return PointRecord.From(curve.Evaluate(parameter, normalized));
        }
        catch
        {
            return null;
        }
    }

    private static PointRecord? SafeEndPoint(Curve curve, int index)
    {
        try
        {
            return PointRecord.From(curve.GetEndPoint(index));
        }
        catch
        {
            return null;
        }
    }

    private static double? SafeParameter(Curve curve, int index)
    {
        try
        {
            return curve.GetEndParameter(index);
        }
        catch
        {
            return null;
        }
    }

    private static PointRecord? SafeCurveVectorProperty(Curve curve, string propertyName)
    {
        try
        {
            var property = curve.GetType().GetProperty(propertyName);
            if (property?.GetValue(curve) is not XYZ vector || vector.GetLength() <= CurveEpsilon) return null;
            return PointRecord.From(vector.Normalize());
        }
        catch
        {
            return null;
        }
    }
}

public sealed class PointRecord
{
    public PointRecord() {}

    public PointRecord(double x, double y, double? z = null)
    {
        X = x;
        Y = y;
        Z = z;
    }

    public double X { get; set; }
    public double Y { get; set; }
    public double? Z { get; set; }

    public static PointRecord From(XYZ xyz)
    {
        return new PointRecord(xyz.X, xyz.Y, xyz.Z);
    }
}
