import React from "react";
import { Text, Box, Newline, useInput } from "ink";

interface BeforeAfterGuideProps {
  onContinue: () => void;
  onSkip: () => void;
}

export const BeforeAfterGuide: React.FC<BeforeAfterGuideProps> = ({
  onContinue,
  onSkip,
}) => {
  const [currentPage, setCurrentPage] = React.useState(0);

  const pages = [
    {
      title: "🔍 Memory Leak Detection Through Comparison",
      content: (
        <>
          <Text color="green" bold>
            This tool compares TWO snapshots to find leaks:
          </Text>
          <Text>✓ before.heapsnapshot - Your app's initial state</Text>
          <Text>
            ✓ after.heapsnapshot - After performing leak-prone actions
          </Text>
          <Newline />

          <Text color="cyan" bold>
            What we'll detect:
          </Text>
          <Text>• Memory growth between snapshots</Text>
          <Text>• Objects that should have been cleaned up</Text>
          <Text>• Detached DOM nodes accumulating</Text>
          <Text>• Event listeners not being removed</Text>
          <Text>• Closures capturing too much data</Text>
          <Newline />

          <Text color="magenta" bold>
            You'll get:
          </Text>
          <Text>• Specific objects causing leaks</Text>
          <Text>• Exact code patterns to fix</Text>
          <Text>• Framework-specific recommendations</Text>
          <Text>• Confidence scores for each potential leak</Text>
        </>
      ),
    },
    {
      title: "📸 Taking Your BEFORE Snapshot",
      content: (
        <>
          <Text color="yellow" bold>
            Step 1: Open your app in Chrome
          </Text>
          <Text>• Navigate to your application</Text>
          <Text>• Perform initial load/login if needed</Text>
          <Text>• Let the app reach a "stable" state</Text>
          <Newline />

          <Text color="yellow" bold>
            Step 2: Open Chrome DevTools
          </Text>
          <Text>• Press F12 or Cmd+Option+I (Mac)</Text>
          <Text>• Click the "Memory" tab</Text>
          <Text>• Select "Heap snapshot" option</Text>
          <Newline />

          <Text color="yellow" bold>
            Step 3: Take the BEFORE snapshot
          </Text>
          <Text>• Click "Take snapshot" button</Text>
          <Text>• Wait for it to complete</Text>
          <Text>• Right-click → "Save as..."</Text>
          <Text color="green">
            • Save as: <Text color="magenta">before.heapsnapshot</Text>
          </Text>
          <Text>• Save to your ./snapshots directory</Text>
          <Newline />
        </>
      ),
    },
    {
      title: "🎯 Triggering Memory Leaks for AFTER Snapshot",
      content: (
        <>
          <Text color="red" bold>
            Now perform actions that might cause leaks:
          </Text>
          <Text>• Navigate between routes/pages multiple times</Text>
          <Text>• Open and close modals/dialogs repeatedly</Text>
          <Text>• Trigger data fetching/API calls</Text>
          <Text>• Use features with timers/intervals</Text>
          <Text>• Add and remove DOM elements dynamically</Text>
          <Newline />

          <Text color="yellow" bold>
            Take the AFTER snapshot:
          </Text>
          <Text>• Go back to DevTools Memory tab</Text>
          <Text>• Click "Take snapshot" again</Text>
          <Text>
            • Save as: <Text color="magenta">after.heapsnapshot</Text>
          </Text>
          <Text>• Save to the same ./snapshots directory</Text>
          <Newline />

          <Text color="cyan" bold>
            💡 Pro tip:
          </Text>
          <Text>The more you repeat leak-prone actions, the clearer</Text>
          <Text>the memory growth pattern will be!</Text>
        </>
      ),
    },
  ];

  useInput((input, key) => {
    if (key.rightArrow || input === "n" || input === "N") {
      if (currentPage < pages.length - 1) {
        setCurrentPage(currentPage + 1);
      }
    } else if (key.leftArrow || input === "p" || input === "P") {
      if (currentPage > 0) {
        setCurrentPage(currentPage - 1);
      }
    } else if (input === "c" || input === "C") {
      onContinue();
    } else if (input === "s" || input === "S") {
      onSkip();
    }
  });

  const currentPageData = pages[currentPage];

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box justifyContent="space-between" marginBottom={1}>
        <Text color="cyan" bold>
          {currentPageData.title}
        </Text>
        <Text color="gray">
          Page {currentPage + 1} of {pages.length}
        </Text>
      </Box>

      <Box flexDirection="column" minHeight={20}>
        {currentPageData.content}
      </Box>

      <Newline />

      <Box
        flexDirection="column"
        borderStyle="single"
        borderTop={true}
        paddingTop={1}
      >
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="row" gap={4}>
            {currentPage > 0 && <Text color="blue">[P] Previous</Text>}
            {currentPage < pages.length - 1 && (
              <Text color="blue">[N] Next</Text>
            )}
          </Box>
          <Box flexDirection="row" gap={4}>
            <Text color="green">[C] Continue to analysis</Text>
            <Text color="yellow">[S] Skip guide</Text>
          </Box>
        </Box>
        <Newline />
        <Text color="gray" italic>
          {currentPage < pages.length - 1
            ? "Use arrow keys or N/P to navigate • Press C to continue or S to skip"
            : "Press C to continue to analysis or S to skip"}
        </Text>
      </Box>
    </Box>
  );
};
