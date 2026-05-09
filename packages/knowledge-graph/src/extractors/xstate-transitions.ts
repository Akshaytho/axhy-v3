/**
 * packages/knowledge-graph/src/extractors/xstate-transitions.ts
 *
 * Stage 2e — extend builder's machine-root finder to also walk every named
 * state inside the machine and every transition.
 * Uses ts-morph for AST-accurate extraction (no regex shortcuts).
 *
 * @derives(ADR-0002)
 */

import { join } from 'node:path';

import { Node, ObjectLiteralExpression, Project } from 'ts-morph';

import type { EdgeRecord, ExtractorContext, ExtractorOutput, NodeRecord } from './index.js';

export async function extractXStateTransitions(ctx: ExtractorContext): Promise<ExtractorOutput> {
  const nodes: NodeRecord[] = [];
  const edges: EdgeRecord[] = [];

  const project = new Project({ useInMemoryFileSystem: false, skipFileDependencyResolution: true });
  const tsFiles = ctx.files.filter((f) => /\.tsx?$/.test(f));
  for (const relPath of tsFiles) {
    project.addSourceFileAtPath(join(ctx.repoRoot, relPath));
  }

  for (const sf of project.getSourceFiles()) {
    const relPath = sf.getFilePath().replace(ctx.repoRoot + '/', '');

    sf.forEachDescendant((node) => {
      if (!Node.isCallExpression(node)) return;
      const expr = node.getExpression().getText();
      // matches: createMachine({...}), setup({...}).createMachine({...})
      if (!/createMachine$/.test(expr)) return;

      const arg = node.getArguments()[0];
      if (!arg || !Node.isObjectLiteralExpression(arg)) return;

      const machineRoot = parseMachineConfig(arg, relPath);
      if (machineRoot) {
        nodes.push(...machineRoot.nodes);
        edges.push(...machineRoot.edges);
      }
    });
  }

  return { nodes, edges };
}

function parseMachineConfig(
  obj: ObjectLiteralExpression,
  sourcePath: string,
): ExtractorOutput | null {
  const idProp = obj.getProperty('id');
  if (!idProp || !Node.isPropertyAssignment(idProp)) return null;
  const idLit = idProp.getInitializer();
  if (!idLit || !Node.isStringLiteral(idLit)) return null;
  const machineId = idLit.getLiteralText();

  const nodes: NodeRecord[] = [
    { kind: 'state', name: machineId, sourcePath, metadata: { isRoot: true } },
  ];
  const edges: EdgeRecord[] = [];

  const statesProp = obj.getProperty('states');
  if (!statesProp || !Node.isPropertyAssignment(statesProp)) return { nodes, edges };
  const statesObj = statesProp.getInitializer();
  if (!statesObj || !Node.isObjectLiteralExpression(statesObj)) return { nodes, edges };

  for (const stateProp of statesObj.getProperties()) {
    if (!Node.isPropertyAssignment(stateProp)) continue;
    const nameNode = stateProp.getNameNode();
    const stateName = nameNode.getText().replace(/['"]/g, '');
    const fullStateName = `${machineId}.${stateName}`;

    nodes.push({
      kind: 'state',
      name: fullStateName,
      sourcePath,
      metadata: { machine: machineId, state: stateName },
    });
    edges.push({
      kind: 'belongs_to',
      srcKey: { kind: 'state', name: fullStateName, sourcePath },
      dstKey: { kind: 'state', name: machineId, sourcePath },
      metadata: {},
    });

    const stateConfig = stateProp.getInitializer();
    if (!stateConfig || !Node.isObjectLiteralExpression(stateConfig)) continue;
    const onProp = stateConfig.getProperty('on');
    if (!onProp || !Node.isPropertyAssignment(onProp)) continue;
    const onObj = onProp.getInitializer();
    if (!onObj || !Node.isObjectLiteralExpression(onObj)) continue;

    for (const eventProp of onObj.getProperties()) {
      if (!Node.isPropertyAssignment(eventProp)) continue;
      const target = eventProp.getInitializer();
      let targetName: string | null = null;
      if (target && Node.isStringLiteral(target)) {
        targetName = target.getLiteralText();
      }
      if (!targetName) continue;

      const eventName = eventProp.getNameNode().getText().replace(/['"]/g, '');
      edges.push({
        kind: 'transitions_to',
        srcKey: { kind: 'state', name: fullStateName, sourcePath },
        dstKey: { kind: 'state', name: `${machineId}.${targetName}`, sourcePath },
        metadata: { event: eventName },
      });
    }
  }

  return { nodes, edges };
}
