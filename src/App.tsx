import React from "react";
import { Text } from "ink";
import { AppStep } from "./types/index.js";
import { Welcome } from "./components/Welcome.js";
import { DirectoryCheck } from "./components/DirectoryCheck.js";
import { SnapshotPrompt } from "./components/SnapshotPrompt.js";
import { Analysis } from "./components/Analysis.js";
import { SnapshotGuide } from "./components/SnapshotGuide.js";
import { SingleHeapAnalysis } from "./components/SingleHeapAnalysis.js";
import { SnapshotInfo } from "./components/SnapshotInfo.js";
import { ReportGeneration } from "./components/ReportGeneration.js";
import { ReportCompletion } from "./components/ReportCompletion.js";
import {
  checkSnapshotDirectory,
  createSnapshotDirectory,
  getSnapshotFiles,
} from "./utils/fileHelpers.js";
import { analyzeHeapSnapshot, AnalysisResult } from "./utils/heapAnalyzer.js";
import { runAgentMode } from "./utils/agentMode.js";

export const App: React.FC = () => {
  const [currentStep, setCurrentStep] = React.useState<AppStep>("welcome");
  const [snapshotFiles, setSnapshotFiles] = React.useState<any[]>([]);
  const [isRescanning, setIsRescanning] = React.useState(false);
  const [singleAnalysisResult, setSingleAnalysisResult] =
    React.useState<AnalysisResult | null>(null);
  const [currentSnapshotName, setCurrentSnapshotName] =
    React.useState<string>("");
  const [currentSnapshotData, setCurrentSnapshotData] =
    React.useState<any>(null);
  const [isGeneratingReport, setIsGeneratingReport] = React.useState(false);
  const [reportSnapshotName, setReportSnapshotName] =
    React.useState<string>("");
  const [generatedReportPath, setGeneratedReportPath] =
    React.useState<string>("");

  React.useEffect(() => {
    if (currentStep === "checkDirectory") {
      if (checkSnapshotDirectory("./snapshots")) {
        const files = getSnapshotFiles("./snapshots");
        setSnapshotFiles(files);
        // If no snapshots exist, guide user to create them
        if (files.length === 0) {
          setCurrentStep("guideSnapshot");
        } else {
          setCurrentStep("ready");
        }
      } else {
        setCurrentStep("promptDirectory");
      }
    }
  }, [currentStep]);

  const handleCreateDirectory = () => {
    try {
      createSnapshotDirectory("./snapshots");
      setCurrentStep("guideSnapshot");
    } catch (error) {
      console.error("Failed to create snapshots directory:", error);
      process.exit(1);
    }
  };

  const handleExit = () => {
    process.exit(0);
  };

  const handleRescanSnapshots = () => {
    setIsRescanning(true);

    // Add a small delay to show the loading state
    setTimeout(() => {
      const files = getSnapshotFiles("./snapshots");
      setSnapshotFiles(files);
      setIsRescanning(false);
    }, 800); // 800ms delay for visual feedback
  };

  const handleSnapshotGuideComplete = () => {
    // Refresh snapshot files and proceed
    const files = getSnapshotFiles("./snapshots");
    setSnapshotFiles(files);
    setCurrentStep("ready");
  };

  const handleSingleAnalysis = async (filename: string) => {
    try {
      setCurrentSnapshotName(filename);
      setCurrentStep("singleAnalysis");
      const filePath = `./snapshots/${filename}`;

      // Read raw snapshot data for tracer
      const fs = await import("fs");
      const rawData = fs.readFileSync(filePath, "utf8");
      const snapshotData = JSON.parse(rawData);
      setCurrentSnapshotData(snapshotData);

      const result = await analyzeHeapSnapshot(filePath);
      setSingleAnalysisResult(result);
    } catch (error) {
      console.error("Failed to analyze heap snapshot:", error);
      // Could add error state here
      setCurrentStep("ready");
    }
  };
  const handleGenerateReport = async (filename: string) => {
    try {
      setReportSnapshotName(filename);
      setCurrentStep("reportGeneration");
      setIsGeneratingReport(true);
      const filePath = `./snapshots/${filename}`;

      // Run agent mode analysis to generate markdown report
      const reportPath = await runAgentMode(filePath, { markdownOutput: true });

      setIsGeneratingReport(false);
      setGeneratedReportPath(reportPath);
      // Go to completion screen instead of back to menu
      setCurrentStep("reportCompletion");
    } catch (error) {
      console.error("Failed to generate markdown report:", error);
      setIsGeneratingReport(false);
      setCurrentStep("ready");
    }
  };

  switch (currentStep) {
    case "welcome":
      return React.createElement(Welcome, {
        onNext: () => setCurrentStep("checkDirectory"),
      });

    case "promptDirectory":
      return React.createElement(DirectoryCheck, {
        onConfirm: handleCreateDirectory,
        onCancel: handleExit,
      });

    case "guideSnapshot":
      return React.createElement(SnapshotGuide, {
        onContinue: handleSnapshotGuideComplete,
        onSkip: handleSnapshotGuideComplete,
      });

    case "ready":
      return React.createElement(SnapshotPrompt, {
        snapshotCount: snapshotFiles.length,
        snapshotFiles: snapshotFiles,
        onAnalyze: () => setCurrentStep("analyze"),
        onSingleAnalysis: handleSingleAnalysis,
        onView: () => setCurrentStep("snapshotInfo"),
        onRescan: handleRescanSnapshots,
        onExit: handleExit,
        isRescanning: isRescanning,
        onGenerateReport: handleGenerateReport, // Add report generation handler
      });

    case "analyze":
      return React.createElement(Analysis, { isLoading: true });

    case "singleAnalysis":
      if (singleAnalysisResult) {
        return React.createElement(SingleHeapAnalysis, {
          analysisResult: singleAnalysisResult,
          snapshotName: currentSnapshotName,
          snapshotData: currentSnapshotData,
          onBack: () => setCurrentStep("ready"),
        });
      } else {
        return React.createElement(Analysis, { isLoading: true });
      }

    case "reportGeneration":
      return React.createElement(ReportGeneration, {
        snapshotName: reportSnapshotName,
        onBack: () => setCurrentStep("ready"),
      });

    case "reportCompletion":
      return React.createElement(ReportCompletion, {
        snapshotName: reportSnapshotName,
        reportPath: generatedReportPath,
        onBackToMenu: () => setCurrentStep("ready"),
      });

    case "snapshotInfo":
      return React.createElement(SnapshotInfo, {
        snapshotFiles: snapshotFiles,
        onBack: () => setCurrentStep("ready"),
      });

    default:
      return React.createElement(Text, null, "Loading...");
  }
};
