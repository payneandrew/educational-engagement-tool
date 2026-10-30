import { users } from '../db'
import type { UserDoc } from '../db/models'

export type UserDTO = { id: string; name: string; role: UserDoc['role'] }

export async function listUsers(): Promise<UserDTO[]> {
  const list = await users.find().sort({ _id: 1 }).toArray()
  return list.map(({ _id, name, role }) => ({ id: _id, name, role }))
}
