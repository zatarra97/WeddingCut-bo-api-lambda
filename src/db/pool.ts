import mysql from "mysql2/promise"

let pool: mysql.Pool | null = null

export function getPool(): mysql.Pool {
	if (!pool) {
		pool = mysql.createPool({
			host: process.env.DB_HOST,
			port: Number(process.env.DB_PORT),
			user: process.env.DB_USER,
			password: process.env.DB_PASSWORD,
			database: process.env.DB_DATABASE,
			connectionLimit: 2,
			waitForConnections: true,
			queueLimit: 10,
			enableKeepAlive: true,
			keepAliveInitialDelay: 10000,
			connectTimeout: 10000,
			// RDS usa TLS di default; mysql2 lo negozia automaticamente
		})
	}
	return pool
}
