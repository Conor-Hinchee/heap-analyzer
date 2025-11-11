import React from "react";
import { Text, Box, Newline, useInput } from "ink";
import {
  GuidedWorkflow,
  UserSkillLevel,
} from "../utils/workflowOrchestrator.js";

interface WorkflowSelectorProps {
  availableWorkflows: Array<{
    id: string;
    name: string;
    description: string;
    suitable: boolean;
    estimatedDuration: number;
    targetAudience: UserSkillLevel[];
  }>;
  userSkillLevel: UserSkillLevel;
  onWorkflowSelect: (workflowId: string) => void;
  onBack: () => void;
}

export const WorkflowSelector: React.FC<WorkflowSelectorProps> = ({
  availableWorkflows,
  userSkillLevel,
  onWorkflowSelect,
  onBack,
}) => {
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const [showDetails, setShowDetails] = React.useState(false);

  // Filter and sort workflows by suitability and user level
  const sortedWorkflows = availableWorkflows.sort((a, b) => {
    // Suitable workflows first
    if (a.suitable && !b.suitable) return -1;
    if (!a.suitable && b.suitable) return 1;

    // Then by target audience match
    const aMatch = a.targetAudience.includes(userSkillLevel);
    const bMatch = b.targetAudience.includes(userSkillLevel);
    if (aMatch && !bMatch) return -1;
    if (!aMatch && bMatch) return 1;

    // Finally by duration (shorter first)
    return a.estimatedDuration - b.estimatedDuration;
  });

  const currentWorkflow = sortedWorkflows[selectedIndex];

  useInput((input, key) => {
    if (showDetails) {
      // In details mode
      if (input === "b" || input === "B" || key.escape) {
        setShowDetails(false);
      } else if (input === "s" || input === "S" || key.return) {
        onWorkflowSelect(currentWorkflow.id);
      }
    } else {
      // In selection mode
      if (key.upArrow || input === "k") {
        setSelectedIndex(Math.max(0, selectedIndex - 1));
      } else if (key.downArrow || input === "j") {
        setSelectedIndex(
          Math.min(sortedWorkflows.length - 1, selectedIndex + 1)
        );
      } else if (key.return || input === " ") {
        setShowDetails(true);
      } else if (input === "s" || input === "S") {
        onWorkflowSelect(currentWorkflow.id);
      } else if (input === "b" || input === "B" || key.escape) {
        onBack();
      }
    }
  });

  const getSkillLevelEmoji = (level: UserSkillLevel): string => {
    switch (level) {
      case "beginner":
        return "🌱";
      case "intermediate":
        return "🚀";
      case "expert":
        return "🏆";
      default:
        return "❓";
    }
  };

  const getSuitabilityEmoji = (suitable: boolean): string => {
    return suitable ? "✅" : "⚠️";
  };

  if (showDetails && currentWorkflow) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="cyan" bold>
          📋 {currentWorkflow.name}
        </Text>
        <Newline />

        <Box flexDirection="column">
          <Text color="yellow" bold>
            Description:
          </Text>
          <Text color="white">{currentWorkflow.description}</Text>
          <Newline />

          <Text color="green" bold>
            Duration:
          </Text>
          <Text color="white">
            ⏱️ Approximately {currentWorkflow.estimatedDuration} minutes
          </Text>
          <Newline />

          <Text color="blue" bold>
            Target Audience:
          </Text>
          <Box flexDirection="row" gap={1}>
            {currentWorkflow.targetAudience.map((level) => (
              <Text key={level} color="white">
                {getSkillLevelEmoji(level)} {level}
              </Text>
            ))}
          </Box>
          <Newline />

          <Text color="magenta" bold>
            {getSuitabilityEmoji(currentWorkflow.suitable)} Suitability:
          </Text>
          {currentWorkflow.suitable ? (
            <Text color="green">
              Perfect match for your {userSkillLevel} skill level!
            </Text>
          ) : (
            <Text color="yellow">
              Designed for {currentWorkflow.targetAudience.join("/")} users. You
              can still use this workflow.
            </Text>
          )}
        </Box>

        <Newline />

        <Box
          flexDirection="column"
          borderStyle="single"
          borderTop={true}
          paddingTop={1}
        >
          <Box flexDirection="row" justifyContent="space-between">
            <Text color="green">[S] Start this workflow</Text>
            <Text color="blue">[B] Back to list</Text>
          </Box>
          <Newline />
          <Text color="gray" italic>
            Press S to start or B to go back...
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Text color="cyan" bold>
        🎯 Select Your Memory Analysis Workflow
      </Text>
      <Text color="gray">
        Your skill level: {getSkillLevelEmoji(userSkillLevel)} {userSkillLevel}
      </Text>
      <Newline />

      <Box flexDirection="column">
        <Text color="yellow" bold>
          Available Workflows:
        </Text>
        <Newline />

        {sortedWorkflows.map((workflow, index) => {
          const isSelected = index === selectedIndex;
          const prefix = isSelected ? "➤" : " ";
          const textColor = isSelected ? "cyan" : "white";
          const bgColor = isSelected ? "bgBlue" : undefined;

          return (
            <Box key={workflow.id} flexDirection="column" marginBottom={1}>
              <Text color={textColor} backgroundColor={bgColor}>
                {prefix} {getSuitabilityEmoji(workflow.suitable)}{" "}
                {workflow.name}
              </Text>
              <Box marginLeft={2}>
                <Text color="gray">
                  {workflow.description} ({workflow.estimatedDuration} min)
                </Text>
              </Box>
              {workflow.suitable && (
                <Box marginLeft={2}>
                  <Text color="green">🎯 Recommended for your skill level</Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      <Newline />

      <Box
        flexDirection="column"
        borderStyle="single"
        borderTop={true}
        paddingTop={1}
      >
        <Box flexDirection="row" justifyContent="space-between">
          <Text color="green">[↑↓] Navigate</Text>
          <Text color="blue">[Enter] View details</Text>
          <Text color="yellow">[S] Quick start</Text>
          <Text color="red">[B] Back</Text>
        </Box>
        <Newline />
        <Text color="gray" italic>
          Use arrow keys to browse • Press Enter for details • S to start • B to
          go back
        </Text>
      </Box>
    </Box>
  );
};
