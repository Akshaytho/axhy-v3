/**
 * @derives(ADR-0002)
 */
import { useMachine } from '@xstate/react';
import { workerMachine } from '@axhy/state-machines';

export default function Page() {
  const [state] = useMachine(workerMachine);
  if (state.matches('ACTIVE')) return <div>Active</div>;
  if (state.matches('INACTIVE')) return <div>Inactive</div>;
  return null;
}
