import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Empty, Panel, StatusDot } from '../components/ui';

const ROW = 110;
const COL = 220;

function layout(nodes, edges) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const depth = new Map();
  function visit(id, trail) {
    if (depth.has(id)) return depth.get(id);
    if (trail.has(id)) return 0;
    trail.add(id);
    const incoming = edges.filter((edge) => edge.from === id).map((edge) => edge.to);
    const value = incoming.length ? 1 + Math.max(...incoming.map((target) => visit(target, trail))) : 0;
    trail.delete(id);
    depth.set(id, value);
    return value;
  }
  nodes.forEach((node) => visit(node.id, new Set()));
  const columns = new Map();
  for (const node of nodes) {
    const column = depth.get(node.id) || 0;
    if (!columns.has(column)) columns.set(column, []);
    columns.get(column).push(node);
  }
  const positions = new Map();
  for (const [column, columnNodes] of columns) {
    columnNodes.forEach((node, index) => {
      positions.set(node.id, { x: 80 + column * COL, y: 48 + index * ROW });
    });
  }
  const maxColumn = Math.max(0, ...columns.keys());
  const tallest = Math.max(...[...columns.values()].map((items) => items.length), 1);
  return {
    positions,
    byId,
    width: 160 + maxColumn * COL,
    height: Math.max(180, ROW * tallest + 24),
  };
}

function segment(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x1: from.x + (dx / length) * 74,
    y1: from.y + (dy / length) * 26,
    x2: to.x - (dx / length) * 82,
    y2: to.y - (dy / length) * 28,
  };
}

const statusStroke = {
  healthy: '#3ddc97',
  degraded: '#f0c14b',
  down: '#ff5d4a',
};

export function GraphPage() {
  const graph = useQuery({
    queryKey: ['dependency-graph'],
    queryFn: () => api('/api/operations/graph'),
  });

  if (graph.isLoading) return <p className="text-muted">Loading the dependency graph…</p>;
  if (graph.error) return <p className="text-danger">{graph.error.message}</p>;
  const data = graph.data.data;
  if (!data.nodes.length) {
    return <Empty title="No services yet" body="Add a service, then mark what it depends on from Operations." />;
  }
  const { positions, width, height } = layout(data.nodes, data.edges);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-semibold">Dependencies</h1>
        <p className="mt-1 text-sm text-muted">An arrow points from a service to the service it depends on. Open incidents sit on the node.</p>
      </div>
      <Panel className="overflow-x-auto p-4">
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="max-w-full" role="img" aria-label="Service dependency graph">
          <defs>
            <marker id="depends-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#93a199" />
            </marker>
          </defs>
          {data.edges.map((edge) => {
            const from = positions.get(edge.from);
            const to = positions.get(edge.to);
            if (!from || !to) return null;
            const line = segment(from, to);
            return (
              <line
                key={`${edge.from}-${edge.to}`}
                {...line}
                stroke="#93a199"
                strokeWidth="1.5"
                markerEnd="url(#depends-arrow)"
              />
            );
          })}
          {data.nodes.map((node) => {
            const point = positions.get(node.id);
            return (
              <Link key={node.id} to={node.incident ? `/incidents/${node.incident.id}` : `/services/${node.id}`}>
                <g transform={`translate(${point.x}, ${point.y})`}>
                  <rect x="-72" y="-24" width="144" height="48" rx="8" fill="#212824" stroke={statusStroke[node.status] || '#3a433d'} />
                  <text textAnchor="middle" y="-2" fill="#e8eee9" fontSize="13">{node.name}</text>
                  <text textAnchor="middle" y="16" fill="#93a199" fontSize="11">
                    {node.incident ? node.incident.number : node.status}
                  </text>
                </g>
              </Link>
            );
          })}
        </svg>
        <ul className="mt-4 space-y-2 text-sm">
          {data.nodes.map((node) => (
            <li key={node.id} className="flex items-center gap-2">
              <StatusDot status={node.status} />
              <Link to={`/services/${node.id}`}>{node.name}</Link>
              {node.incident ? <Link className="text-signal" to={`/incidents/${node.incident.id}`}>{node.incident.number}</Link> : null}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
