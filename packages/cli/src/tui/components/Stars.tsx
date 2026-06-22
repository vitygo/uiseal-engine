import { useMemo } from 'react';
import { Box, Text, useAnimation } from 'ink';

function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

interface Star {
  top: number;
  left: number;
  phaseOffset: number;
  speed: number;
}

const STAR_COUNT = 18;

export default function Stars() {
  const { time } = useAnimation({ interval: 500 });

  const stars = useMemo<Star[]>(
    () =>
      Array.from({ length: STAR_COUNT }, (_, i) => ({
        top: Math.floor(seededRandom(i * 5 + 1) * 26) + 2,
        left: Math.floor(seededRandom(i * 5 + 2) * 86) + 2,
        phaseOffset: seededRandom(i * 5 + 3) * Math.PI * 2,
        speed: seededRandom(i * 5 + 4) * 0.8 + 0.3,
      })),
    [],
  );

  return (
    <>
      {stars.map((star, i) => {
        const val = Math.sin((time / 2500) * star.speed + star.phaseOffset);
        const color = val > 0.5 ? '#3a3a3a' : val > 0 ? '#282828' : '#1a1a1a';
        return (
          <Box key={i} position="absolute" top={star.top} left={star.left}>
            <Text color={color}>·</Text>
          </Box>
        );
      })}
    </>
  );
}
