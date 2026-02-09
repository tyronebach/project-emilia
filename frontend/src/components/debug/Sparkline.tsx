interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  baseline?: number;
}

export function Sparkline({
  data,
  width = 312,
  height = 40,
  color = '#60a5fa',
  baseline,
}: SparklineProps) {
  if (data.length < 2) {
    return (
      <svg width={width} height={height} className="opacity-30">
        <text x={width / 2} y={height / 2 + 3} textAnchor="middle" fontSize={9} fill="currentColor">
          Not enough data
        </text>
      </svg>
    );
  }

  const pad = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const toX = (i: number) => pad + (i / (data.length - 1)) * (width - pad * 2);
  const toY = (v: number) => height - pad - ((v - min) / range) * (height - pad * 2);

  const points = data.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');

  const baselineY =
    baseline !== undefined
      ? toY(baseline)
      : min <= 0 && max >= 0
        ? toY(0)
        : null;

  return (
    <svg width={width} height={height} className="block">
      {baselineY !== null && (
        <line
          x1={pad}
          y1={baselineY}
          x2={width - pad}
          y2={baselineY}
          stroke="white"
          strokeOpacity={0.15}
          strokeDasharray="3,3"
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Last-point dot */}
      <circle
        cx={toX(data.length - 1)}
        cy={toY(data[data.length - 1])}
        r={2.5}
        fill={color}
      />
    </svg>
  );
}
