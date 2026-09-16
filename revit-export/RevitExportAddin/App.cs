using System;
using Autodesk.Revit.ApplicationServices;
using Autodesk.Revit.DB;
using DesignAutomationFramework;

namespace OurApp.RevitExportAddin;

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
            var runner = new RevitExportRunner();
            runner.Run(e.DesignAutomationData);
            e.Succeeded = true;
        }
        catch (Exception ex)
        {
            Console.WriteLine("OurApp Revit export failed:");
            Console.WriteLine(ex);
            RevitExportReportWriter.WriteFailureReport("revit-export-report.json", ex);
            e.Succeeded = false;
        }
    }
}
