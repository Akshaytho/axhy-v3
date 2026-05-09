import { prisma } from '../db.js';

/** @derives(ADR-0002) */
export async function listWorkers(companyId: string) {
  const workers = await prisma.worker.findMany({
    where: { companyId },
    select: { id: true, name: true, phone: true },
  });
  return workers.map((w) => ({ id: w.id, name: w.name }));
}

/** @derives(ADR-0002) */
export async function createWorker(input: { name: string; phone: string }) {
  return prisma.worker.create({
    data: { name: input.name, phone: input.phone, companyId: 'x' },
  });
}

/** @derives(ADR-0002) */
export async function deleteWorker(id: string) {
  return prisma.worker.delete({ where: { id } });
}
