import mysql from "mysql2/promise";

export class MariaDbConnection {
  constructor(databaseConfig) {
    this.pool = mysql.createPool({ ...databaseConfig, waitForConnections: true, connectionLimit: 10, namedPlaceholders: true, timezone: "+07:00", charset: "utf8mb4" });
  }

  query(sql, values) { return this.pool.query(sql, values); }
  execute(sql, values) { return this.pool.execute(sql, values); }
  getConnection() { return this.pool.getConnection(); }
  end() { return this.pool.end(); }

  async transaction(work) {
    const connection = await this.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

