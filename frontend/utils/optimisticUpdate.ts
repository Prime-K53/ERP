export async function optimisticUpdate<T>(
  doOptimistic: () => void,
  doAsync: () => Promise<T>,
  rollback: () => void
): Promise<T> {
  doOptimistic();
  try {
    return await doAsync();
  } catch (error) {
    rollback();
    throw error;
  }
}
