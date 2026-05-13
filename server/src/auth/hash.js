import bcryptjs from 'bcryptjs';

const ROUNDS = 10;

export const hashPassword = (plain) => bcryptjs.hash(plain, ROUNDS);
export const verifyPassword = (plain, hash) => bcryptjs.compare(plain, hash);
