using System;
using Autodesk.Revit.ApplicationServices;
using Autodesk.Revit.DB;
using DesignAutomationFramework;

namespace OurApp.RevitImportExtractorAddin;

public sealed class App : IExternalDBApplication
{
    public ExternalDBApplicationResult OnStartup(ControlledApplication application)
    {
        DesignAutomationBridge.DesignAutomationReadyEvent += OnDesignAutomationReady;
        return ExternalDBApplicationResult.Succeeded;
    }

    public ExternalDBApplicationResult OnShutdown(ControlledApplication application)
    {
        DesignAutomationBridge.DesignAutomationReadyEvent -= OnDesignAutomationReady;
        return ExternalDBApplicationResult.Succeeded;
    }

    private static void OnDesignAutomationReady(object? sender, DesignAutomationReadyEventArgs e)
    {
        try
        {
            var runner = new RevitImportExtractionRunner();
            runner.Run(e.DesignAutomationData);
            e.Succeeded = true;
        }
        catch (Exception ex)
        {
            Console.WriteLine("OurApp APS Revit import extraction failed:");
            Console.WriteLine(ex);
            RevitImportExtractionRunner.WriteFailureReport("RevitExtractionReport.json", ex);
            e.Succeeded = false;
        }
    }
}
