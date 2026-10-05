import type { EdgeSupabaseClient } from "./auth.ts";

export type UserStorageObject = {
  bucket_id: string;
  name: string;
};

export type StorageCleanupFailure = {
  bucket_id: string;
  object_count: number;
  message: string;
};

export async function listUserStorageObjects(
  adminClient: EdgeSupabaseClient,
  userId: string,
): Promise<UserStorageObject[]> {
  const { data, error } = await adminClient.rpc(
    "admin_list_user_storage_objects_for_deletion",
    { p_user_id: userId },
  );

  if (error) {
    throw new Error(`Unable to list user storage objects: ${error.message}`);
  }

  return (Array.isArray(data) ? data : [])
    .map((row: any) => ({
      bucket_id: typeof row?.bucket_id === "string" ? row.bucket_id.trim() : "",
      name: typeof row?.name === "string" ? row.name.trim() : "",
    }))
    .filter((row) => row.bucket_id.length > 0 && row.name.length > 0);
}

export async function removeUserStorageObjects(
  adminClient: EdgeSupabaseClient,
  objects: UserStorageObject[],
) {
  const byBucket = new Map<string, string[]>();

  for (const object of objects) {
    const paths = byBucket.get(object.bucket_id) || [];
    paths.push(object.name);
    byBucket.set(object.bucket_id, paths);
  }

  let removedCount = 0;
  const failures: StorageCleanupFailure[] = [];

  for (const [bucketId, paths] of byBucket) {
    for (let offset = 0; offset < paths.length; offset += 1000) {
      const batch = paths.slice(offset, offset + 1000);
      const { error } = await adminClient.storage.from(bucketId).remove(batch);

      if (error) {
        failures.push({
          bucket_id: bucketId,
          object_count: batch.length,
          message: error.message,
        });
        continue;
      }

      removedCount += batch.length;
    }
  }

  return {
    discovered_count: objects.length,
    removed_count: removedCount,
    failures,
  };
}
