/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: { center: true },
    extend: {
      colors: {
        // 设计稿主色：远立蓝
        primary: {
          DEFAULT: "#1664ff",
          hover: "#0055ff",
          1: "#f3f7ff",
          2: "#ebf1ff",
          3: "#97bcff",
          4: "#6e9fff",
          5: "#387bff",
          6: "#1664ff",
          7: "#1759dd",
          8: "#114ab9",
        },
        // 图表色
        chart: {
          1: "#387bff",
          2: "#7ccd94",
          3: "#f0a50f",
          4: "#ff706d",
          5: "#86909c",
        },
        // 暗色表面层
        surface: {
          DEFAULT: "#1d2129",
          dim: "#000b1a",
          low: "#1d2129",
          container: "#202833",
          high: "#2a3440",
          highest: "#41464f",
          sidebar: "#1d2129",
        },
        // 状态色
        success: "#7ccd94",
        warning: "#f0a50f",
        danger: "#ff706d",
        muted: "#86909c",
        // 文本层级（暗色）
        ink: {
          DEFAULT: "#ffffff",
          secondary: "rgba(255,255,255,0.78)",
          tertiary: "#86909c",
          disabled: "#41464f",
        },
      },
      fontFamily: {
        sans: ['"PingFang SC"', '"Microsoft YaHei"', '"Helvetica Neue"', "Arial", "sans-serif"],
        mono: ['"SF Mono"', "Menlo", "Consolas", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
      fontSize: {
        caption: ["10px", "18px"],
        body: ["12px", "20px"],
        lead: ["13px", "22px"],
        h4: ["14px", "22px"],
        h3: ["16px", "24px"],
        h2: ["18px", "26px"],
        h1: ["20px", "28px"],
        display: ["24px", "32px"],
      },
      boxShadow: {
        "ds-1": "0px 1px 2px 0px rgba(0,0,0,0.24)",
        "ds-2": "0px 2px 6px 0px rgba(0,0,0,0.32)",
        "ds-3": "0px 5px 15px 0px rgba(0,0,0,0.36), 0px 2px 4px 0px rgba(0,0,0,0.2)",
        "ds-4": "0px 15px 35px -2px rgba(0,0,0,0.44), 0px 5px 15px 0px rgba(0,0,0,0.28)",
        "ds-5": "0px 24px 48px -4px rgba(0,0,0,0.5), 0px 8px 20px 0px rgba(0,0,0,0.32)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-edge": {
          "0%,100%": { boxShadow: "inset 3px 0 0 0 rgba(255,112,109,0.0)" },
          "50%": { boxShadow: "inset 3px 0 0 0 rgba(255,112,109,0.8)" },
        },
        "spin-once": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        "breathe": {
          "0%,100%": { opacity: "0.4", transform: "scale(0.85)" },
          "50%": { opacity: "1", transform: "scale(1.1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 240ms ease-out both",
        "pulse-edge": "pulse-edge 1.2s ease-in-out 2",
        "spin-once": "spin-once 500ms ease-in-out",
        "breathe": "breathe 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
