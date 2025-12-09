import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import { db } from "./db/db.js";
import { ALL_COMMANDS } from "./commands.js";

/**
 * Generates a bar chart showing command usage for a specific user
 * @param {string} userId - Discord user ID
 * @returns {Promise<Buffer>} PNG image buffer of the chart
 */
export async function generateUsageChart(userId) {
  // Fetch user data from Firestore
  const userDoc = await db.collection("users").doc(userId).get();

  if (!userDoc.exists) {
    // Return a chart showing no data
    return generateEmptyChart();
  }

  const userData = userDoc.data();

  // Extract command names and usage counts
  const labels = [];
  const data = [];

  // Iterate through all commands to get their usage
  for (const command of ALL_COMMANDS) {
    const commandName = command.name;
    const usageData = userData[commandName];

    if (usageData && usageData.usages > 0) {
      labels.push(commandName);
      data.push(usageData.usages);
    }
  }

  // If no usage data, return empty chart
  if (labels.length === 0) {
    return generateEmptyChart();
  }

  // Configure chart
  const width = 800;
  const height = 600;
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

  const configuration = {
    type: "bar",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Command Usages",
          data: data,
          backgroundColor: "rgba(88, 101, 242, 0.8)", // Discord blurple
          borderColor: "rgba(88, 101, 242, 1)",
          borderWidth: 2,
        },
      ],
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
            color: "#ffffff",
          },
          grid: {
            color: "rgba(255, 255, 255, 0.1)",
          },
        },
        x: {
          ticks: {
            color: "#ffffff",
          },
          grid: {
            color: "rgba(255, 255, 255, 0.1)",
          },
        },
      },
      plugins: {
        legend: {
          labels: {
            color: "#ffffff",
            font: {
              size: 14,
            },
          },
        },
        title: {
          display: true,
          text: "Your Command Usage Statistics",
          color: "#ffffff",
          font: {
            size: 18,
            weight: "bold",
          },
        },
      },
      backgroundColor: "#36393f", // Discord dark background
    },
    plugins: [
      {
        id: "customCanvasBackgroundColor",
        beforeDraw: (chart) => {
          const { ctx } = chart;
          ctx.save();
          ctx.globalCompositeOperation = "destination-over";
          ctx.fillStyle = "#36393f";
          ctx.fillRect(0, 0, chart.width, chart.height);
          ctx.restore();
        },
      },
    ],
  };

  // Generate the chart as a buffer
  const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  return buffer;
}

/**
 * Generates an empty chart when user has no data
 * @returns {Promise<Buffer>} PNG image buffer of an empty chart
 */
async function generateEmptyChart() {
  const width = 800;
  const height = 600;
  const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

  const configuration = {
    type: "bar",
    data: {
      labels: ["No Data"],
      datasets: [
        {
          label: "Command Usages",
          data: [0],
          backgroundColor: "rgba(88, 101, 242, 0.8)",
          borderColor: "rgba(88, 101, 242, 1)",
          borderWidth: 2,
        },
      ],
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          max: 5,
          ticks: {
            stepSize: 1,
            color: "#ffffff",
          },
          grid: {
            color: "rgba(255, 255, 255, 0.1)",
          },
        },
        x: {
          ticks: {
            color: "#ffffff",
          },
          grid: {
            color: "rgba(255, 255, 255, 0.1)",
          },
        },
      },
      plugins: {
        legend: {
          labels: {
            color: "#ffffff",
            font: {
              size: 14,
            },
          },
        },
        title: {
          display: true,
          text: "No Command Usage Data Yet",
          color: "#ffffff",
          font: {
            size: 18,
            weight: "bold",
          },
        },
      },
    },
    plugins: [
      {
        id: "customCanvasBackgroundColor",
        beforeDraw: (chart) => {
          const { ctx } = chart;
          ctx.save();
          ctx.globalCompositeOperation = "destination-over";
          ctx.fillStyle = "#36393f";
          ctx.fillRect(0, 0, chart.width, chart.height);
          ctx.restore();
        },
      },
    ],
  };

  const buffer = await chartJSNodeCanvas.renderToBuffer(configuration);
  return buffer;
}
