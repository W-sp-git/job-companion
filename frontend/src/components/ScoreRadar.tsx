import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";

import type { DimScore } from "@/api/types";

export default function ScoreRadar({ data }: { data: DimScore[] }) {
  if (!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={data} outerRadius="70%">
        <PolarGrid stroke="rgb(36 31 23 / 0.22)" />
        <PolarAngleAxis
          dataKey="name"
          tick={{ fill: "#6a6152", fontSize: 12, fontFamily: "PingFang SC, Hiragino Sans GB, sans-serif" }}
        />
        <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
        <Radar dataKey="score" stroke="#b23a24" strokeWidth={2} fill="#b23a24" fillOpacity={0.16} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
