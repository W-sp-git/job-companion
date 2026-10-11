import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from "recharts";

import type { DimScore } from "@/api/types";

export default function ScoreRadar({ data }: { data: DimScore[] }) {
  if (!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={data} outerRadius="70%">
        <PolarGrid stroke="#404040" />
        <PolarAngleAxis dataKey="name" tick={{ fill: "#a3a3a3", fontSize: 12 }} />
        <PolarRadiusAxis domain={[0, 10]} tick={false} axisLine={false} />
        <Radar dataKey="score" stroke="#10b981" fill="#10b981" fillOpacity={0.35} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
