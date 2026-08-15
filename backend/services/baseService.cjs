const sq = require('./supabaseQuery.cjs');

class BaseService {
  constructor() {
  }

  get db() {
    return sq;
  }

  /**
   * Single-organization mode: queries are no longer scoped by tenant.
   */
  _scopeSql(sql, params) {
    return { sql, params };
  }

  _run(sql, params = []) {
    const scoped = this._scopeSql(sql, params);
    return sq.run(scoped.sql, scoped.params);
  }

  _get(sql, params = []) {
    const scoped = this._scopeSql(sql, params);
    return sq.getOne(scoped.sql, scoped.params);
  }

  _all(sql, params = []) {
    const scoped = this._scopeSql(sql, params);
    return sq.getAll(scoped.sql, scoped.params);
  }

  async _transaction(callback) {
    return callback();
  }
}

module.exports = BaseService;
