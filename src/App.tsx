import React from "react";
import { Text } from "ink";
import { AppStep } from "./types/index.js";
import { Welcome } from "./components/Welcome.js";
import { DirectoryCheck } from "./components/DirectoryCheck.js";
import { BeforeAfterPrompt } from "./components/BeforeAfterPrompt.js";
import { BeforeAfterGuide } from "./components/BeforeAfterGuide.js";
import { BeforeAfterReport } from "./components/BeforeAfterReport.js";
import { SnapshotInfo } from "./components/SnapshotInfo.js";
import { ReportGeneration } from "./components/ReportGeneration.js";
import { ReportCompletion } from "./components/ReportCompletion.js";
import {
  checkSnapshotDirectory,
  createSnapshotDirectory,
  getSnapshotFiles,
} from "./utils/fileHelpers.js";
import {
  BeforeAfterAnalyzer,
  ComparisonResult,
} from "./utils/beforeAfterAnalyzer.js";
import { runAgentMode } from "./utils/agentMode.js";

export const App: React.FC = () => {
  const [currentStep, setCurrentStep] = React.useState<AppStep>("welcome");
  const [snapshotFiles, setSnapshotFiles] = React.useState<any[]>([]);
  const [isRescanning, setIsRescanning] = React.useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = React.useState(false);
  const [reportSnapshotName, setReportSnapshotName] =
    React.useState<string>("");
  const [generatedReportPath, setGeneratedReportPath] =
    React.useState<string>("");
  const [comparisonResult, setComparisonResult] =
    React.useState<ComparisonResult | null>(null);

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

  const handleBeforeAfterAnalysis = async () => {
    try {
      setCurrentStep("analyze");

      // Check if we have both required snapshots
      const beforePath = "./snapshots/before.heapsnapshot";
      const afterPath = "./snapshots/after.heapsnapshot";

      // Load both snapshots
      const fs = await import("fs");

      if (!fs.existsSync(beforePath)) {
        throw new Error("before.heapsnapshot not found");
      }
      if (!fs.existsSync(afterPath)) {
        throw new Error("after.heapsnapshot not found");
      }

      const beforeRawData = fs.readFileSync(beforePath, "utf8");
      const afterRawData = fs.readFileSync(afterPath, "utf8");

      const beforeSnapshot = JSON.parse(beforeRawData);
      const afterSnapshot = JSON.parse(afterRawData);

      // Perform before/after comparison
      const analyzer = new BeforeAfterAnalyzer(beforeSnapshot, afterSnapshot);
      const result = await analyzer.analyze();

      setComparisonResult(result);
      setCurrentStep("results");
    } catch (error) {
      console.error("Failed to analyze heap snapshots:", error);
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
      return React.createElement(BeforeAfterGuide, {
        onContinue: handleSnapshotGuideComplete,
        onSkip: handleSnapshotGuideComplete,
      });

    case "ready":
      return React.createElement(BeforeAfterPrompt, {
        snapshotCount: snapshotFiles.length,
        snapshotFiles: snapshotFiles,
        onAnalyze: handleBeforeAfterAnalysis,
        onView: () => setCurrentStep("snapshotInfo"),
        onRescan: handleRescanSnapshots,
        onExit: handleExit,
        isRescanning: isRescanning,
      });

    case "analyze":
      return React.createElement("div", {}, [
        React.createElement(
          Text,
          { key: "title", color: "cyan" },
          "🔍 Analyzing snapshots for memory leaks..."
        ),
        React.createElement(
          Text,
          { key: "subtitle", color: "gray" },
          "Comparing before.heapsnapshot with after.heapsnapshot"
        ),
        React.createElement(
          Text,
          { key: "wait", color: "yellow" },
          "This may take a few moments..."
        ),
      ]);

    case "reportGeneration":
      return React.createElement(ReportGeneration, {
        snapshotName: reportSnapshotName,
        onBack: () => setCurrentStep("ready"),
        onCancel: () => {
          setIsGeneratingReport(false);
          setCurrentStep("ready");
        },
      });

    case "reportCompletion":
      return React.createElement(ReportCompletion, {
        snapshotName: "before.heapsnapshot → after.heapsnapshot",
        reportPath: generatedReportPath,
        onBackToMenu: () => setCurrentStep("ready"),
      });

    case "snapshotInfo":
      return React.createElement(SnapshotInfo, {
        snapshotFiles: snapshotFiles,
        onBack: () => setCurrentStep("ready"),
      });

    case "results":
      if (comparisonResult) {
        return React.createElement(BeforeAfterReport, {
          result: comparisonResult,
          onRestart: () => {
            setComparisonResult(null);
            setCurrentStep("ready");
          },
        });
      } else {
        return React.createElement(
          Text,
          { color: "red" },
          "No comparison results available"
        );
      }

    default:
      return React.createElement(Text, null, "Loading...");
  }
};
