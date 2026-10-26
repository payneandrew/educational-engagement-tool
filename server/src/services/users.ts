import { users } from '../db'

export async function listUsers() {
  const list = await users.find().sort({ _id: 1 }).toArray()
  return list.map(({ _id, name, role }) => ({ id: _id, name, role }))
}
