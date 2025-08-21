import React from "react";
import { Text, Box, Newline, useInput } from "ink";

interface ReportGenerationProps {
  snapshotName: string;
  onBack: () => void;
  onCancel?: () => void;
}

export const ReportGeneration: React.FC<ReportGenerationProps> = ({
  snapshotName,
  onBack,
  onCancel,
}) => {
  const [dots, setDots] = React.useState("");
  const [showCancel, setShowCancel] = React.useState(true);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useInput((input, key) => {
    if (input.toLowerCase() === "c" && showCancel) {
      setShowCancel(false);
      if (onCancel) onCancel();
    }
  });

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color="green" bold>
        📝 Generating Markdown Report
      </Text>
      <Newline />

      <Box flexDirection="column" marginY={1}>
        <Text color="cyan">
          📊 Analyzing: <Text color="yellow">{snapshotName}</Text>
        </Text>
        <Text color="blue">⏳ Processing heap snapshot data{dots}</Text>
        <Text color="blue">🔍 Running advanced leak detection{dots}</Text>
        <Text color="blue">🎯 Detecting frameworks and libraries{dots}</Text>
        <Text color="blue">📝 Generating markdown report{dots}</Text>
      </Box>

      <Newline />

      <Box flexDirection="column">
        <Text color="gray" italic>
          This may take a few moments for large snapshots...
        </Text>
        <Text color="gray" italic>
          The report will be saved to the reports/ directory
        </Text>
      </Box>

      <Newline />

      {showCancel && (
        <Text color="yellow">
          Press{" "}
          <Text color="red" bold>
            c
          </Text>{" "}
          to cancel and return to menu
        </Text>
      )}
    </Box>
  );
};
