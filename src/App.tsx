import React from "react";
import { Text } from "ink";
import { AppStep } from "./types/index.js";
import { Welcome } from "./components/Welcome.js";
import { DirectoryCheck } from "./components/DirectoryCheck.js";
import { SnapshotPrompt } from "./components/SnapshotPrompt.js";
import { Analysis } from "./components/Analysis.js";
import {
  checkSnapshotDirectory,
  createSnapshotDirectory,
  getSnapshotFiles,
} from "./utils/fileHelpers.js";

export const App: React.FC = () => {
  const [currentStep, setCurrentStep] = React.useState<AppStep>("welcome");
  const [snapshotFiles, setSnapshotFiles] = React.useState<any[]>([]);

  React.useEffect(() => {
    if (currentStep === "checkDirectory") {
      if (checkSnapshotDirectory("./snapshots")) {
        const files = getSnapshotFiles("./snapshots");
        setSnapshotFiles(files);
        setCurrentStep("ready");
      } else {
        setCurrentStep("promptDirectory");
      }
    }
  }, [currentStep]);

  const handleCreateDirectory = () => {
    try {
      createSnapshotDirectory("./snapshots");
      setCurrentStep("directoryCreated");
    } catch (error) {
      console.error("Failed to create snapshots directory:", error);
      process.exit(1);
    }
  };

  const handleExit = () => {
    process.exit(0);
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

    case "directoryCreated":
      return React.createElement(
        Text,
        { color: "green" },
        "✅ Snapshots directory created! You can now add .heapsnapshot files and run the analyzer again."
      );

    case "ready":
      return React.createElement(SnapshotPrompt, {
        snapshotCount: snapshotFiles.length,
        onAnalyze: () => setCurrentStep("analyze"),
        onView: () => console.log("View functionality coming soon!"),
        onExit: handleExit,
      });

    case "analyze":
      return React.createElement(Analysis, { isLoading: true });

    default:
      return React.createElement(Text, null, "Loading...");
  }
};
