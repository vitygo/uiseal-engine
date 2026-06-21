import { differenceCiede2000 } from 'culori';

export interface ColorCluster {
  /** Normalized hex of the most-used member (seeds the cluster). */
  representative: string;
  /** All normalized hex members, including the representative. */
  members: string[];
  totalCount: number;
}

const DEFAULT_THRESHOLD = 10; // CIEDE2000 units

/**
 * Groups perceptually-close colors into clusters.
 * Input map: normalized hex → usage count.
 * Greedy algorithm: entries are processed in descending count order so the
 * most-used color always seeds its cluster and becomes the representative.
 */
export function clusterColors(
  colorMap: Map<string, number>,
  threshold = DEFAULT_THRESHOLD,
): ColorCluster[] {
  const delta = differenceCiede2000();

  const entries = [...colorMap.entries()].sort((a, b) => b[1] - a[1]);

  const clusters: Array<{
    representative: string;
    members: string[];
    totalCount: number;
  }> = [];

  for (const [color, count] of entries) {
    let merged = false;
    for (const cluster of clusters) {
      if (delta(color, cluster.representative) <= threshold) {
        cluster.members.push(color);
        cluster.totalCount += count;
        merged = true;
        break;
      }
    }
    if (!merged) {
      clusters.push({ representative: color, members: [color], totalCount: count });
    }
  }

  clusters.sort((a, b) => b.totalCount - a.totalCount);

  return clusters;
}
