import React from "react";
import { Text, Box, Newline } from "ink";
import {
  WorkflowProgress,
  GuidedWorkflow,
  SmartRecommendation,
} from "../utils/workflowOrchestrator.js";

interface ProgressDashboardProps {
  workflow: GuidedWorkflow;
  progress: WorkflowProgress;
  currentStepIndex: number;
  recommendations?: SmartRecommendation[];
}

export const ProgressDashboard: React.FC<ProgressDashboardProps> = ({
  workflow,
  progress,
  currentStepIndex,
  recommendations = [],
}) => {
  const currentStep = workflow.steps[currentStepIndex];

  const renderProgressBar = (
    percentage: number,
    width: number = 30
  ): string => {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    return "█".repeat(filled) + "░".repeat(empty);
  };

  const getTimeEstimate = (minutes: number): string => {
    if (minutes < 1) return "< 1 min";
    if (minutes < 60) return `${Math.round(minutes)} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${Math.round(mins)}m`;
  };

  const getPriorityEmoji = (
    priority: SmartRecommendation["priority"]
  ): string => {
    switch (priority) {
      case "critical":
        return "🔥";
      case "high":
        return "⚠️";
      case "medium":
        return "💡";
      case "low":
        return "ℹ️";
      default:
        return "📝";
    }
  };

  const getTypeEmoji = (type: SmartRecommendation["type"]): string => {
    switch (type) {
      case "next_step":
        return "👉";
      case "optimization":
        return "⚡";
      case "learning":
        return "📚";
      case "troubleshooting":
        return "🔧";
      default:
        return "💬";
    }
  };

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Workflow Header */}
      <Text color="cyan" bold>
        🎯 {workflow.name}
      </Text>
      <Text color="gray">{workflow.description}</Text>
      <Newline />

      {/* Progress Section */}
      <Box
        flexDirection="column"
        borderStyle="single"
        paddingX={1}
        paddingY={0}
      >
        <Text color="yellow" bold>
          📊 Progress
        </Text>

        <Box flexDirection="row" alignItems="center" gap={2}>
          <Text color="white">Overall:</Text>
          <Text color="cyan">
            {renderProgressBar(progress.completionPercentage)}{" "}
            {progress.completionPercentage}%
          </Text>
        </Box>

        <Box flexDirection="row" gap={4}>
          <Text color="green">✅ {progress.completedSteps} completed</Text>
          {progress.skippedSteps > 0 && (
            <Text color="yellow">⏭️ {progress.skippedSteps} skipped</Text>
          )}
          {progress.failedSteps > 0 && (
            <Text color="red">❌ {progress.failedSteps} failed</Text>
          )}
          <Text color="blue">
            ⏱️ {getTimeEstimate(progress.estimatedTimeRemaining)} remaining
          </Text>
        </Box>
      </Box>

      <Newline />

      {/* Current Step */}
      {currentStep && (
        <>
          <Text color="green" bold>
            📍 Current Step ({currentStepIndex + 1}/{workflow.steps.length}):
          </Text>
          <Box flexDirection="column" marginLeft={1}>
            <Text color="white" bold>
              {currentStep.title}
            </Text>
            <Text color="gray">{currentStep.description}</Text>
            <Text color="blue">
              ⏱️ Estimated time: {getTimeEstimate(currentStep.estimatedTime)}
            </Text>
          </Box>
          <Newline />
        </>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <>
          <Text color="yellow" bold>
            💡 Smart Recommendations:
          </Text>
          <Box flexDirection="column" marginLeft={1}>
            {recommendations.slice(0, 3).map((rec, index) => (
              <Box
                key={rec.id}
                flexDirection="row"
                alignItems="flex-start"
                gap={1}
              >
                <Text color="white">
                  {getPriorityEmoji(rec.priority)} {getTypeEmoji(rec.type)}
                </Text>
                <Box flexDirection="column" flexShrink={1}>
                  <Text color="white" bold>
                    {rec.title}
                  </Text>
                  <Text color="gray">{rec.description}</Text>
                  {rec.autoImplementable && (
                    <Text color="green" italic>
                      🤖 Can be auto-implemented
                    </Text>
                  )}
                </Box>
              </Box>
            ))}

            {recommendations.length > 3 && (
              <Text color="blue" italic>
                ... and {recommendations.length - 3} more recommendations
              </Text>
            )}
          </Box>
          <Newline />
        </>
      )}

      {/* Step History */}
      <Text color="blue" bold>
        📋 Step History:
      </Text>
      <Box flexDirection="column" marginLeft={1}>
        {workflow.steps.slice(0, currentStepIndex + 2).map((step, index) => {
          let statusEmoji = "⏳";
          let statusColor: string = "gray";

          switch (step.status) {
            case "completed":
              statusEmoji = "✅";
              statusColor = "green";
              break;
            case "active":
              statusEmoji = "🔄";
              statusColor = "cyan";
              break;
            case "skipped":
              statusEmoji = "⏭️";
              statusColor = "yellow";
              break;
            case "failed":
              statusEmoji = "❌";
              statusColor = "red";
              break;
          }

          return (
            <Box key={step.id} flexDirection="row" gap={1}>
              <Text color={statusColor}>{statusEmoji}</Text>
              <Text
                color={index === currentStepIndex ? "white" : "gray"}
                bold={index === currentStepIndex}
              >
                {step.title}
              </Text>
              {index === currentStepIndex && (
                <Text color="cyan" italic>
                  ← Current
                </Text>
              )}
            </Box>
          );
        })}

        {workflow.steps.length > currentStepIndex + 2 && (
          <Text color="gray" italic>
            ... and {workflow.steps.length - currentStepIndex - 2} more steps
          </Text>
        )}
      </Box>
    </Box>
  );
};
