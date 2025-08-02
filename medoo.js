/**
 * Medoo database framework for Node.js
 * Ported from PHP Medoo version 1.7.10
 * https://medoo.in
 * 
 * A lightweight, functional-style ORM for Node.js
 * Copyright 2025, Node.js port by Claude
 * Released under the MIT license
 */

const mysql = require('mysql2/promise');

class Raw {
    constructor(value, map = {}) {
        this.value = value;
        this.map = map;
    }
}

class Medoo {
    constructor(options = {}) {
        this.connection = null;
        this.type = 'mysql';
        this.prefix = options.prefix || '';
        this.logging = options.logging || false;
        this.debugMode = false;
        this.logs = [];
        this.guid = 0;
        this.lastError = null;
        this.config = options; // Store config for later use

        if (options.type) {
            this.type = options.type.toLowerCase();
            if (this.type === 'mariadb') {
                this.type = 'mysql';
            }
        }

        // Initialize connection asynchronously
        this.initConnection(options).catch(error => {
            console.error('Database connection failed:', error.message);
        });
    }

    async initConnection(options) {
        const config = {
            host: options.server || options.host || 'localhost',
            port: options.port || 3306,
            user: options.username || 'root',
            password: options.password || '',
            database: options.database_name || options.database,
            charset: options.charset || 'utf8mb4',
            timezone: 'Z',
            ...options.option
        };

        if (options.socket) {
            config.socketPath = options.socket;
            delete config.host;
            delete config.port;
        }

        try {
            this.connection = await mysql.createConnection(config);
            
            // Set SQL mode for MySQL compatibility
            if (this.type === 'mysql') {
                await this.connection.execute('SET SQL_MODE=ANSI_QUOTES');
            }
        } catch (error) {
            throw new Error(`Database connection failed: ${error.message}`);
        }
    }

    // Ensure connection is ready before executing queries
    async ensureConnection() {
        if (!this.connection) {
            await this.initConnection(this.config);
        }
        return this.connection;
    }

    // Static method to create Raw queries
    static raw(string, map = {}) {
        return new Raw(string, map);
    }

    raw(string, map = {}) {
        return new Raw(string, map);
    }

    isRaw(object) {
        return object instanceof Raw;
    }

    // Generate unique parameter keys
    mapKey() {
        return `:medoo_${this.guid++}_param`;
    }

    // Quote table names
    tableQuote(table) {
        if (!/^[a-zA-Z0-9_]+$/i.test(table)) {
            throw new Error(`Incorrect table name "${table}"`);
        }
        return `"${this.prefix}${table}"`;
    }

    // Quote column names
    columnQuote(string) {
        if (!/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)?$/i.test(string)) {
            throw new Error(`Incorrect column name "${string}"`);
        }

        if (string.includes('.')) {
            return `"${this.prefix}${string.replace('.', '"."')}"`;
        }

        return `"${string}"`;
    }

    // Type mapping for parameters
    typeMap(value, type) {
        if (type === 'boolean') {
            value = value ? '1' : '0';
        } else if (type === 'object' && value === null) {
            value = null;
        }

        return value;
    }

    // Build raw query with parameter mapping
    buildRaw(raw, map) {
        if (!this.isRaw(raw)) {
            return false;
        }

        let query = raw.value;
        
        // Replace table/column references
        query = query.replace(
            /(([`']).*?)?((FROM|TABLE|INTO|UPDATE|JOIN)\s*)?\<(([a-zA-Z0-9_]+)(\.[a-zA-Z0-9_]+)?)\>(.*?\2)?/gi,
            (match, p1, p2, p3, p4, p5) => {
                if (p2 && p1.includes(p2)) {
                    return match;
                }

                if (p4) {
                    return p1 + p4 + ' ' + this.tableQuote(p5);
                }

                return p1 + this.columnQuote(p5);
            }
        );

        // Merge parameter maps
        if (raw.map && Object.keys(raw.map).length > 0) {
            Object.assign(map, raw.map);
        }

        return query;
    }

    // Array to comma-separated string with proper quoting
    arrayQuote(array) {
        const stack = [];
        for (const value of array) {
            if (typeof value === 'number') {
                stack.push(value);
            } else {
                stack.push(this.connection.escape(value));
            }
        }
        return stack.join(',');
    }

    // Column processing for SELECT statements
    columnPush(columns, map, root = false, isJoin = false) {
        if (columns === '*') {
            return columns;
        }

        const stack = [];

        if (typeof columns === 'string') {
            columns = [columns];
        }

        for (const [key, value] of Object.entries(columns)) {
            const isIntKey = /^\d+$/.test(key);

            if (!isIntKey && Array.isArray(value) && root && Object.keys(columns).length === 1) {
                stack.push(this.columnQuote(key));
                stack.push(this.columnPush(value, map, false, isJoin));
            } else if (Array.isArray(value)) {
                stack.push(this.columnPush(value, map, false, isJoin));
            } else if (!isIntKey && this.isRaw(value)) {
                const raw = this.buildRaw(value, map);
                const match = key.match(/(?<column>[a-zA-Z0-9_\.]+)(\s*\[(?<type>(String|Bool|Int|Number))\])?/i);
                stack.push(`${raw} AS ${this.columnQuote(match.groups.column)}`);
            } else if (isIntKey && typeof value === 'string') {
                if (isJoin && value.includes('*')) {
                    throw new Error('Cannot use table.* to select all columns while joining table');
                }

                const match = value.match(/(?<column>[a-zA-Z0-9_\.]+)(?:\s*\((?<alias>[a-zA-Z0-9_]+)\))?(?:\s*\[(?<type>(?:String|Bool|Int|Number|Object|JSON))\])?/i);

                if (match.groups.alias) {
                    stack.push(`${this.columnQuote(match.groups.column)} AS ${this.columnQuote(match.groups.alias)}`);
                    columns[key] = match.groups.alias;

                    if (match.groups.type) {
                        columns[key] += ` [${match.groups.type}]`;
                    }
                } else {
                    stack.push(this.columnQuote(match.groups.column));
                }
            }
        }

        return stack.join(',');
    }

    // Execute query with logging
    async exec(query, parameters = {}) {
        this.lastError = null;

        if (this.debugMode) {
            console.log(this.generate(query, parameters));
            this.debugMode = false;
            return false;
        }

        // Ensure connection is ready
        await this.ensureConnection();

        if (this.logging) {
            this.logs.push([query, parameters]);
        } else {
            this.logs = [[query, parameters]];
        }

        try {
            // Convert named parameters to positional parameters for mysql2
            let finalQuery = query;
            const values = [];
            
            // Replace named parameters with ? and collect values in order
            for (const [key, value] of Object.entries(parameters)) {
                finalQuery = finalQuery.replace(key, '?');
                values.push(value);
            }

            const [rows] = await this.connection.execute(finalQuery, values);
            return { rows, query: finalQuery, parameters: values };
        } catch (error) {
            this.lastError = error;
            throw error;
        }
    }

    // Generate final query for debugging
    generate(query, parameters) {
        let finalQuery = query;
        
        for (const [key, value] of Object.entries(parameters)) {
            const replacement = typeof value === 'string' ? `'${value.replace(/'/g, "''")}'` : value;
            finalQuery = finalQuery.replace(key, replacement);
        }

        return finalQuery;
    }

    // Inner conjunction for complex WHERE conditions
    innerConjunct(data, map, conjunctor, outerConjunctor) {
        const stack = [];

        for (const value of data) {
            stack.push(`(${this.dataImplode(value, map, conjunctor)})`);
        }

        return stack.join(`${outerConjunctor} `);
    }

    // Main data processing for WHERE conditions
    dataImplode(data, map, conjunctor) {
        const stack = [];

        for (const [key, value] of Object.entries(data)) {
            const type = typeof value;

            // Handle AND/OR logical operators
            if (type === 'object' && /^(AND|OR)(\s+#.*)?$/.test(key)) {
                const relationship = key.match(/^(AND|OR)/)[1];

                if (Array.isArray(value)) {
                    if (Array.isArray(value[0])) {
                        stack.push(`(${this.innerConjunct(value, map, ` ${relationship}`, conjunctor)})`);
                    } else {
                        stack.push(`(${this.dataImplode(value, map, ` ${relationship}`)})`);
                    }
                } else {
                    // Handle object case for OR/AND
                    stack.push(`(${this.dataImplode(value, map, ` ${relationship}`)})`);
                }
                continue;
            }

            const mapKey = this.mapKey();

            // Handle column comparisons like "column1[>=]column2"
            if (/^\d+$/.test(key) && /([a-zA-Z0-9_\.]+)\[(?<operator>\>\=?|\<\=?|\!?\=)\]([a-zA-Z0-9_\.]+)/i.test(value)) {
                const match = value.match(/([a-zA-Z0-9_\.]+)\[(?<operator>\>\=?|\<\=?|\!?\=)\]([a-zA-Z0-9_\.]+)/i);
                stack.push(`${this.columnQuote(match[1])} ${match.groups.operator} ${this.columnQuote(match[3])}`);
            } else {
                const match = key.match(/([a-zA-Z0-9_\.\(\)\*]+)(\[(?<operator>\>\=?|\<\=?|\!|\<\>|\>\<|\!?~|REGEXP)\])?/i);
                
                // Check if it's a SQL function (contains parentheses)
                let column;
                if (match[1].includes('(') && match[1].includes(')')) {
                    // It's a SQL function, don't quote it
                    column = match[1];
                } else {
                    // Regular column name, quote it
                    column = this.columnQuote(match[1]);
                }

                if (match.groups && match.groups.operator) {
                    const operator = match.groups.operator;

                    if (['>', '>=', '<', '<='].includes(operator)) {
                        let condition = `${column} ${operator} `;

                        if (typeof value === 'number') {
                            condition += mapKey;
                            map[mapKey] = value;
                        } else if (this.isRaw(value)) {
                            condition += this.buildRaw(value, map);
                        } else {
                            condition += mapKey;
                            map[mapKey] = value;
                        }

                        stack.push(condition);
                    } else if (operator === '!') {
                        switch (type) {
                            case 'object':
                                if (value === null) {
                                    stack.push(`${column} IS NOT NULL`);
                                } else if (Array.isArray(value)) {
                                    const placeholders = [];
                                    value.forEach((item, index) => {
                                        const stackKey = `${mapKey}${index}_i`;
                                        placeholders.push(stackKey);
                                        map[stackKey] = item;
                                    });
                                    stack.push(`${column} NOT IN (${placeholders.join(', ')})`);
                                } else if (this.isRaw(value)) {
                                    stack.push(`${column} != ${this.buildRaw(value, map)}`);
                                }
                                break;
                            default:
                                stack.push(`${column} != ${mapKey}`);
                                map[mapKey] = this.typeMap(value, type);
                                break;
                        }
                    } else if (operator === '~' || operator === '!~') {
                        let valueArray = Array.isArray(value) ? value : [value];
                        let connector = ' OR ';
                        const data = Object.values(valueArray);

                        if (Array.isArray(data[0])) {
                            if (valueArray.AND || valueArray.OR) {
                                connector = ` ${Object.keys(valueArray)[0]} `;
                                valueArray = data[0];
                            }
                        }

                        const likeClauses = [];
                        valueArray.forEach((item, index) => {
                            let itemStr = String(item);

                            if (!/(\[.+\]|[\*\?\!\%#^-_]|%.+|.+%)/.test(itemStr)) {
                                itemStr = `%${itemStr}%`;
                            }

                            likeClauses.push(`${column}${operator === '!~' ? ' NOT' : ''} LIKE ${mapKey}L${index}`);
                            map[`${mapKey}L${index}`] = itemStr;
                        });

                        stack.push(`(${likeClauses.join(connector)})`);
                    } else if (operator === '<>' || operator === '><') {
                        if (Array.isArray(value)) {
                            let columnStr = column;
                            if (operator === '><') {
                                columnStr += ' NOT';
                            }

                            stack.push(`(${columnStr} BETWEEN ${mapKey}a AND ${mapKey}b)`);
                            map[`${mapKey}a`] = value[0];
                            map[`${mapKey}b`] = value[1];
                        }
                    } else if (operator === 'REGEXP') {
                        stack.push(`${column} REGEXP ${mapKey}`);
                        map[mapKey] = value;
                    }
                } else {
                    // No operator, direct comparison
                    switch (type) {
                        case 'object':
                            if (value === null) {
                                stack.push(`${column} IS NULL`);
                            } else if (Array.isArray(value)) {
                                const placeholders = [];
                                value.forEach((item, index) => {
                                    const stackKey = `${mapKey}${index}_i`;
                                    placeholders.push(stackKey);
                                    map[stackKey] = item;
                                });
                                stack.push(`${column} IN (${placeholders.join(', ')})`);
                            } else if (this.isRaw(value)) {
                                stack.push(`${column} = ${this.buildRaw(value, map)}`);
                            }
                            break;
                        default:
                            stack.push(`${column} = ${mapKey}`);
                            map[mapKey] = this.typeMap(value, type);
                            break;
                    }
                }
            }
        }

        return stack.join(`${conjunctor} `);
    }

    // Build WHERE clause with GROUP BY, ORDER BY, LIMIT
    whereClause(where, map) {
        let whereClause = '';

        if (typeof where === 'object' && where !== null && !this.isRaw(where)) {
            const whereKeys = Object.keys(where);
            const conditions = { ...where };

            // Remove special keys from conditions
            ['GROUP', 'ORDER', 'HAVING', 'LIMIT', 'LIKE', 'MATCH'].forEach(key => {
                delete conditions[key];
            });

            if (Object.keys(conditions).length > 0) {
                whereClause = ` WHERE ${this.dataImplode(conditions, map, ' AND')}`;
            }

            // GROUP BY
            if (where.GROUP) {
                if (Array.isArray(where.GROUP)) {
                    const groupColumns = where.GROUP.map(column => this.columnQuote(column));
                    whereClause += ` GROUP BY ${groupColumns.join(',')}`;
                } else if (this.isRaw(where.GROUP)) {
                    whereClause += ` GROUP BY ${this.buildRaw(where.GROUP, map)}`;
                } else {
                    whereClause += ` GROUP BY ${this.columnQuote(where.GROUP)}`;
                }

                // HAVING
                if (where.HAVING) {
                    if (this.isRaw(where.HAVING)) {
                        whereClause += ` HAVING ${this.buildRaw(where.HAVING, map)}`;
                    } else {
                        whereClause += ` HAVING ${this.dataImplode(where.HAVING, map, ' AND')}`;
                    }
                }
            }

            // ORDER BY
            if (where.ORDER) {
                if (this.isRaw(where.ORDER)) {
                    whereClause += ` ORDER BY ${this.buildRaw(where.ORDER, map)}`;
                } else if (typeof where.ORDER === 'object' && !Array.isArray(where.ORDER)) {
                    // Handle object case: { column: 'direction', ... }
                    const orderStack = [];
                    for (const [column, direction] of Object.entries(where.ORDER)) {
                        if (Array.isArray(direction)) {
                            orderStack.push(`FIELD(${this.columnQuote(column)}, ${this.arrayQuote(direction)})`);
                        } else if (direction === 'ASC' || direction === 'DESC') {
                            orderStack.push(`${this.columnQuote(column)} ${direction}`);
                        } else if (/^\d+$/.test(column)) {
                            orderStack.push(this.columnQuote(direction));
                        }
                    }
                    whereClause += ` ORDER BY ${orderStack.join(',')}`;
                } else if (Array.isArray(where.ORDER)) {
                    // Handle array case: ['column1', 'column2'] or mixed
                    const orderStack = [];
                    for (const [index, value] of Object.entries(where.ORDER)) {
                        if (typeof value === 'string') {
                            orderStack.push(this.columnQuote(value));
                        }
                    }
                    whereClause += ` ORDER BY ${orderStack.join(',')}`;
                } else {
                    // Handle simple string case
                    whereClause += ` ORDER BY ${this.columnQuote(where.ORDER)}`;
                }
            }

            // LIMIT
            if (where.LIMIT) {
                if (typeof where.LIMIT === 'number') {
                    whereClause += ` LIMIT ${where.LIMIT}`;
                } else if (Array.isArray(where.LIMIT) && where.LIMIT.length === 2) {
                    whereClause += ` LIMIT ${where.LIMIT[1]} OFFSET ${where.LIMIT[0]}`;
                }
            }
        } else if (this.isRaw(where)) {
            whereClause += ` ${this.buildRaw(where, map)}`;
        }

        return whereClause;
    }

    // Enable debug mode
    debug() {
        this.debugMode = true;
        return this;
    }

    // Get last error
    error() {
        return this.lastError;
    }

    // Get last executed query
    last() {
        const log = this.logs[this.logs.length - 1];
        return this.generate(log[0], log[1]);
    }

    // Get all executed queries
    log() {
        return this.logs.map(log => this.generate(log[0], log[1]));
    }

    // Build SELECT context for complex queries
    selectContext(table, map, join, columns = null, where = null, columnFn = null) {
        // Parse table with alias
        const tableMatch = table.match(/(?<table>[a-zA-Z0-9_]+)\s*\((?<alias>[a-zA-Z0-9_]+)\)/i);
        let tableQuery;

        if (tableMatch && tableMatch.groups) {
            const quotedTable = this.tableQuote(tableMatch.groups.table);
            tableQuery = `${quotedTable} AS ${this.tableQuote(tableMatch.groups.alias)}`;
        } else {
            const quotedTable = this.tableQuote(table);
            tableQuery = quotedTable;
        }

        let isJoin = false;
        let joinKeys = null;
        
        if (join && typeof join === 'object' && !Array.isArray(join)) {
            joinKeys = Object.keys(join);
            if (joinKeys.length > 0 && joinKeys[0].startsWith('[')) {
                isJoin = true;
                tableQuery += ' ' + this.buildJoin(table, join);
            }
        }
        
        if (!isJoin) {
            // Adjust parameters based on arguments when not a JOIN
            if (columns === null) {
                if (where !== null || (typeof join === 'object' && columnFn !== null)) {
                    where = join;
                    columns = null;
                } else {
                    where = null;
                    columns = join;
                }
            } else {
                where = columns;
                columns = join;
            }
        }

        let column;
        if (columnFn !== null) {
            if (columnFn === 1) {
                column = '1';
                if (where === null) {
                    where = columns;
                }
            } else if (this.isRaw(columnFn)) {
                column = this.buildRaw(columnFn, map);
            } else {
                if (!columns || this.isRaw(columns)) {
                    columns = '*';
                    where = join;
                }
                column = `${columnFn}(${this.columnPush(columns, map, true)})`;
            }
        } else {
            column = this.columnPush(columns, map, true, isJoin);
        }

        return `SELECT ${column} FROM ${tableQuery}${this.whereClause(where, map)}`;
    }

    // Build JOIN clauses
    buildJoin(table, join) {
        const tableJoin = [];
        const joinArray = {
            '>': 'LEFT',
            '<': 'RIGHT',
            '<>': 'FULL',
            '><': 'INNER'
        };

        for (const [subTable, relation] of Object.entries(join)) {
            const match = subTable.match(/(\[(?<join>\<\>?|\>\<?)\])?(?<table>[a-zA-Z0-9_]+)\s?(\((?<alias>[a-zA-Z0-9_]+)\))?/);

            if (match.groups.join && match.groups.table) {
                let relationStr = relation;

                if (typeof relation === 'string') {
                    relationStr = `USING ("${relation}")`;
                } else if (Array.isArray(relation)) {
                    if (relation[0] && typeof relation[0] === 'string') {
                        relationStr = `USING ("${relation.join('", "')}")`;
                    } else {
                        const joins = [];
                        for (const [key, value] of Object.entries(relation)) {
                            const leftSide = key.includes('.') 
                                ? this.columnQuote(key)
                                : `${this.tableQuote(table)}."${key}"`;
                            const rightSide = `${this.tableQuote(match.groups.alias || match.groups.table)}."${value}"`;
                            joins.push(`${leftSide} = ${rightSide}`);
                        }
                        relationStr = `ON ${joins.join(' AND ')}`;
                    }
                } else if (typeof relation === 'object' && relation !== null) {
                    // Handle object case: { column1: 'column2', ... }
                    const joins = [];
                    for (const [key, value] of Object.entries(relation)) {
                        const leftSide = key.includes('.') 
                            ? this.columnQuote(key)
                            : `${this.tableQuote(table)}."${key}"`;
                        const rightSide = `${this.tableQuote(match.groups.alias || match.groups.table)}."${value}"`;
                        joins.push(`${leftSide} = ${rightSide}`);
                    }
                    relationStr = `ON ${joins.join(' AND ')}`;
                }

                let tableName = this.tableQuote(match.groups.table) + ' ';
                if (match.groups.alias) {
                    tableName += `AS ${this.tableQuote(match.groups.alias)} `;
                }

                tableJoin.push(`${joinArray[match.groups.join]} JOIN ${tableName}${relationStr}`);
            }
        }

        return tableJoin.join(' ');
    }

    // Column mapping for data processing
    columnMap(columns, stack, root = true) {
        if (columns === '*' || !columns) {
            return stack;
        }

        if (typeof columns !== 'object' || Array.isArray(columns)) {
            return stack;
        }

        for (const [key, value] of Object.entries(columns)) {
            const isIntKey = /^\d+$/.test(key);

            if (isIntKey) {
                const match = value.match(/([a-zA-Z0-9_]+\.)?(?<column>[a-zA-Z0-9_]+)(?:\s*\((?<alias>[a-zA-Z0-9_]+)\))?(?:\s*\[(?<type>(?:String|Bool|Int|Number|Object|JSON))\])?/i);

                const columnKey = match.groups.alias || match.groups.column;
                const type = match.groups.type || 'String';

                stack[value] = [columnKey, type];
            } else if (this.isRaw(value)) {
                const match = key.match(/([a-zA-Z0-9_]+\.)?(?<column>[a-zA-Z0-9_]+)(\s*\[(?<type>(String|Bool|Int|Number))\])?/i);
                const columnKey = match.groups.column;
                const type = match.groups.type || 'String';

                stack[key] = [columnKey, type];
            } else if (!isIntKey && Array.isArray(value)) {
                if (root && Object.keys(columns).length === 1) {
                    stack[key] = [key, 'String'];
                }
                this.columnMap(value, stack, false);
            }
        }

        return stack;
    }

    // Data mapping for result processing
    dataMap(data, columns, columnMap, stack, root, result) {
        if (root) {
            // Handle special case when columns is '*' or array
            if (columns === '*' || Array.isArray(columns) || typeof columns !== 'object' || columns === null) {
                const currentStack = [];
                this.dataMap(data, columns, columnMap, currentStack, false, result);
                result.push(currentStack);
                return;
            }

            const columnsKey = Object.keys(columns);

            if (columnsKey.length === 1 && Array.isArray(columns[columnsKey[0]])) {
                const indexKey = columnsKey[0];
                const dataKey = indexKey.replace(/^[a-zA-Z0-9_]+\./i, '');

                const currentStack = [];
                this.dataMap(data, columns[indexKey], columnMap, currentStack, false, result);

                const index = data[dataKey];
                result[index] = currentStack;
            } else {
                const currentStack = [];
                this.dataMap(data, columns, columnMap, currentStack, false, result);
                result.push(currentStack);
            }
            return;
        }

        // Handle non-root data mapping
        if (columns === '*' || Array.isArray(columns) || typeof columns !== 'object' || columns === null) {
            // For simple column selection, copy all data
            Object.assign(stack, data);
            return;
        }

        for (const [key, value] of Object.entries(columns)) {
            const isRaw = this.isRaw(value);
            const isIntKey = /^\d+$/.test(key);

            if (isIntKey || isRaw) {
                const map = columnMap[isRaw ? key : value];
                if (!map) continue;
                
                const columnKey = map[0];
                let item = data[columnKey];

                if (map[1]) {
                    if (isRaw && ['Object', 'JSON'].includes(map[1])) {
                        continue;
                    }

                    if (item === null) {
                        stack[columnKey] = null;
                        continue;
                    }

                    switch (map[1]) {
                        case 'Number':
                            stack[columnKey] = parseFloat(item);
                            break;
                        case 'Int':
                            stack[columnKey] = parseInt(item);
                            break;
                        case 'Bool':
                            stack[columnKey] = Boolean(item);
                            break;
                        case 'Object':
                            try {
                                stack[columnKey] = JSON.parse(item);
                            } catch {
                                stack[columnKey] = item;
                            }
                            break;
                        case 'JSON':
                            try {
                                stack[columnKey] = JSON.parse(item);
                            } catch {
                                stack[columnKey] = item;
                            }
                            break;
                        case 'String':
                        default:
                            stack[columnKey] = item;
                            break;
                    }
                } else {
                    stack[columnKey] = item;
                }
            } else {
                const currentStack = [];
                this.dataMap(data, value, columnMap, currentStack, false, result);
                stack[key] = currentStack;
            }
        }
    }

    // ============= CRUD METHODS =============

    // SELECT - Query multiple records
    async select(table, join, columns = null, where = null) {
        const map = {};
        const result = [];
        const columnMap = {};

        const column = where === null ? join : columns;
        const isSingle = (typeof column === 'string' && column !== '*');

        const query = this.selectContext(table, map, join, columns, where);
        const { rows } = await this.exec(query, map);

        // Handle '*' columns case - return raw rows
        if (columns === '*' || (where === null && join === '*')) {
            return rows;
        }

        // Only build column map if we have structured column selection
        if (columns && columns !== '*' && typeof columns === 'object') {
            this.columnMap(columns, columnMap, true);
        }

        for (const data of rows) {
            const currentStack = [];
            this.dataMap(data, columns, columnMap, currentStack, true, result);
        }

        if (isSingle && columnMap[column]) {
            const singleResult = [];
            const resultKey = columnMap[column][0];

            for (const item of result) {
                singleResult.push(item[resultKey]);
            }

            return singleResult;
        }

        return result;
    }

    // GET - Query single record
    async get(table, join = null, columns = null, where = null) {
        const map = {};
        const result = [];
        const columnMap = {};
        const currentStack = [];

        let column;
        if (where === null) {
            column = join;
            if (columns && columns.LIMIT) {
                delete columns.LIMIT;
            }
        } else {
            column = columns;
            if (where && where.LIMIT) {
                delete where.LIMIT;
            }
        }

        const isSingle = (typeof column === 'string' && column !== '*');

        const query = this.selectContext(table, map, join, columns, where) + ' LIMIT 1';
        const { rows } = await this.exec(query, map);

        if (rows.length > 0) {
            const data = rows[0];

            // Handle '*' columns case - return raw data
            if (column === '*' || (where === null && join === '*')) {
                return data;
            }

            // Only build column map if we have structured column selection
            if (columns && columns !== '*' && typeof columns === 'object') {
                this.columnMap(columns, columnMap, true);
                this.dataMap(data, columns, columnMap, currentStack, true, result);
            }

            if (isSingle && columnMap[column]) {
                return result[0] ? result[0][columnMap[column][0]] : null;
            }

            return result[0] || data;
        }

        return null;
    }

    // HAS - Check if record exists
    async has(table, join, where = null) {
        const map = {};
        const column = null;

        const query = `SELECT EXISTS(${this.selectContext(table, map, join, column, where, 1)})`;
        const { rows } = await this.exec(query, map);

        const result = rows[0] ? Object.values(rows[0])[0] : 0;
        return result === 1 || result === '1' || result === true;
    }

    // INSERT - Insert records
    async insert(table, datas) {
        const stack = [];
        let columns = [];
        const fields = [];
        const map = {};

        if (!Array.isArray(datas)) {
            datas = [datas];
        }

        // Get all unique columns
        for (const data of datas) {
            for (const key of Object.keys(data)) {
                columns.push(key);
            }
        }

        columns = [...new Set(columns)];

        // Build values for each record
        for (const data of datas) {
            const values = [];

            for (const key of columns) {
                if (this.isRaw(data[key])) {
                    values.push(this.buildRaw(data[key], map));
                    continue;
                }

                const mapKey = this.mapKey();
                values.push(mapKey);

                if (!(key in data)) {
                    map[mapKey] = null;
                } else {
                    const value = data[key];
                    const type = typeof value;

                    switch (type) {
                        case 'object':
                            if (value === null) {
                                map[mapKey] = null;
                            } else if (Array.isArray(value)) {
                                map[mapKey] = key.endsWith('[JSON]') ? JSON.stringify(value) : JSON.stringify(value);
                            } else {
                                map[mapKey] = JSON.stringify(value);
                            }
                            break;
                        default:
                            map[mapKey] = this.typeMap(value, type);
                            break;
                    }
                }
            }

            stack.push(`(${values.join(', ')})`);
        }

        // Build field names
        for (const key of columns) {
            fields.push(this.columnQuote(key.replace(/(\s*\[JSON\]$)/i, '')));
        }

        const query = `INSERT INTO ${this.tableQuote(table)} (${fields.join(', ')}) VALUES ${stack.join(', ')}`;
        const result = await this.exec(query, map);

        return {
            affectedRows: result.rows.affectedRows,
            insertId: result.rows.insertId
        };
    }

    // UPDATE - Update records
    async update(table, data, where = null) {
        const fields = [];
        const map = {};

        for (const [key, value] of Object.entries(data)) {
            const column = this.columnQuote(key.replace(/(\s*\[(JSON|\+|\-|\*|\/)\]$)/i, ''));

            if (this.isRaw(value)) {
                fields.push(`${column} = ${this.buildRaw(value, map)}`);
                continue;
            }

            const mapKey = this.mapKey();
            const match = key.match(/(?<column>[a-zA-Z0-9_]+)(\[(?<operator>\+|\-|\*|\/)\])?/i);

            if (match.groups.operator) {
                if (typeof value === 'number') {
                    fields.push(`${column} = ${column} ${match.groups.operator} ${value}`);
                }
            } else {
                fields.push(`${column} = ${mapKey}`);

                const type = typeof value;
                switch (type) {
                    case 'object':
                        if (value === null) {
                            map[mapKey] = null;
                        } else if (Array.isArray(value)) {
                            map[mapKey] = key.endsWith('[JSON]') ? JSON.stringify(value) : JSON.stringify(value);
                        } else {
                            map[mapKey] = JSON.stringify(value);
                        }
                        break;
                    default:
                        map[mapKey] = this.typeMap(value, type);
                        break;
                }
            }
        }

        const query = `UPDATE ${this.tableQuote(table)} SET ${fields.join(', ')}${this.whereClause(where, map)}`;
        const result = await this.exec(query, map);

        return {
            affectedRows: result.rows.affectedRows,
            changedRows: result.rows.changedRows
        };
    }

    // DELETE - Delete records
    async delete(table, where) {
        const map = {};

        const query = `DELETE FROM ${this.tableQuote(table)}${this.whereClause(where, map)}`;
        const result = await this.exec(query, map);

        return {
            affectedRows: result.rows.affectedRows
        };
    }

    // REPLACE - Replace text in columns
    async replace(table, columns, where = null) {
        if (!columns || typeof columns !== 'object' || Object.keys(columns).length === 0) {
            return false;
        }

        const map = {};
        const stack = [];

        for (const [column, replacements] of Object.entries(columns)) {
            if (typeof replacements === 'object') {
                for (const [oldValue, newValue] of Object.entries(replacements)) {
                    const mapKey = this.mapKey();

                    stack.push(`${this.columnQuote(column)} = REPLACE(${this.columnQuote(column)}, ${mapKey}a, ${mapKey}b)`);

                    map[`${mapKey}a`] = oldValue;
                    map[`${mapKey}b`] = newValue;
                }
            }
        }

        if (stack.length === 0) {
            return false;
        }

        const query = `UPDATE ${this.tableQuote(table)} SET ${stack.join(', ')}${this.whereClause(where, map)}`;
        const result = await this.exec(query, map);

        return {
            affectedRows: result.rows.affectedRows,
            changedRows: result.rows.changedRows
        };
    }

    // ============= AGGREGATE METHODS =============

    // Generic aggregate function
    async aggregate(type, table, join = null, column = null, where = null) {
        const map = {};

        const query = this.selectContext(table, map, join, column, where, type.toUpperCase());
        const { rows } = await this.exec(query, map);

        if (rows.length === 0) {
            return 0;
        }

        const result = rows[0] ? Object.values(rows[0])[0] : 0;
        return isNaN(result) ? result : Number(result);
    }

    // COUNT - Count records
    async count(table, join = null, column = null, where = null) {
        return await this.aggregate('count', table, join, column, where);
    }

    // AVG - Average value
    async avg(table, join, column = null, where = null) {
        return await this.aggregate('avg', table, join, column, where);
    }

    // MAX - Maximum value
    async max(table, join, column = null, where = null) {
        return await this.aggregate('max', table, join, column, where);
    }

    // MIN - Minimum value
    async min(table, join, column = null, where = null) {
        return await this.aggregate('min', table, join, column, where);
    }

    // SUM - Sum of values
    async sum(table, join, column = null, where = null) {
        return await this.aggregate('sum', table, join, column, where);
    }

    // ============= TRANSACTION SUPPORT =============

    // Execute actions in a transaction
    async action(actions) {
        if (typeof actions !== 'function') {
            return false;
        }

        await this.ensureConnection();
        await this.connection.beginTransaction();

        try {
            const result = await actions(this);

            if (result === false) {
                await this.connection.rollback();
                return false;
            } else {
                await this.connection.commit();
                return result;
            }
        } catch (error) {
            await this.connection.rollback();
            throw error;
        }
    }

    // Manual transaction control
    async beginTransaction() {
        await this.ensureConnection();
        await this.connection.beginTransaction();
    }

    async commit() {
        await this.ensureConnection();
        await this.connection.commit();
    }

    async rollback() {
        await this.ensureConnection();
        await this.connection.rollback();
    }

    // ============= PARALLEL QUERY METHODS =============

    // 并行执行多个查询 - 性能优化的关键方法
    async parallel(queries) {
        const promises = queries.map(async (query) => {
            const { method, table, ...args } = query;
            return await this[method](table, ...Object.values(args));
        });

        return await Promise.all(promises);
    }

    // 批量查询助手 - 更简洁的语法
    async batch(operations) {
        const promises = operations.map(op => {
            if (typeof op === 'function') {
                return op(this);
            }
            return op;
        });

        return await Promise.all(promises);
    }

    // 条件并行查询 - 根据条件决定是否并行
    async parallelIf(condition, queries) {
        if (condition) {
            return await this.parallel(queries);
        } else {
            // 串行执行
            const results = [];
            for (const query of queries) {
                const { method, table, ...args } = query;
                results.push(await this[method](table, ...Object.values(args)));
            }
            return results;
        }
    }

    // 管道式查询 - 前一个查询的结果作为后一个查询的输入
    async pipeline(queries) {
        let result = null;
        for (const queryFn of queries) {
            result = await queryFn(this, result);
        }
        return result;
    }

    // 分片并行查询 - 大数据量查询优化
    async parallelSelect(table, columns, where, options = {}) {
        const { chunkSize = 1000, maxParallel = 5 } = options;
        
        // 首先获取总数
        const totalCount = await this.count(table, where);
        
        if (totalCount <= chunkSize) {
            return await this.select(table, columns, where);
        }

        // 计算分片
        const chunks = Math.ceil(totalCount / chunkSize);
        const actualParallel = Math.min(chunks, maxParallel);
        
        const promises = [];
        for (let i = 0; i < actualParallel; i++) {
            const offset = i * chunkSize;
            const chunkWhere = {
                ...where,
                LIMIT: [offset, chunkSize]
            };
            promises.push(this.select(table, columns, chunkWhere));
        }

        const results = await Promise.all(promises);
        return results.flat();
    }

    // ============= UTILITY METHODS =============

    // Get last insert ID
    async id() {
        try {
            await this.ensureConnection();
            const [rows] = await this.connection.execute('SELECT LAST_INSERT_ID() as id');
            return rows[0] ? rows[0].id : null;
        } catch (error) {
            return null;
        }
    }

    // Create table
    async create(table, columns, options = null) {
        const stack = [];
        const tableName = this.prefix + table;

        for (const [name, definition] of Object.entries(columns)) {
            const isIntKey = /^\d+$/.test(name);

            if (isIntKey) {
                stack.push(definition.replace(/\<([a-zA-Z0-9_]+)\>/gi, '"$1"'));
            } else if (Array.isArray(definition)) {
                stack.push(`${name} ${definition.join(' ')}`);
            } else if (typeof definition === 'string') {
                stack.push(`${name} ${definition}`);
            }
        }

        let tableOption = '';

        if (Array.isArray(options)) {
            const optionStack = [];
            for (const [key, value] of Object.entries(options)) {
                if (typeof value === 'string' || typeof value === 'number') {
                    optionStack.push(`${key} = ${value}`);
                }
            }
            tableOption = ' ' + optionStack.join(', ');
        } else if (typeof options === 'string') {
            tableOption = ' ' + options;
        }

        const query = `CREATE TABLE IF NOT EXISTS ${tableName} (${stack.join(', ')})${tableOption}`;
        const result = await this.exec(query, {});

        return {
            success: true,
            query
        };
    }

    // Drop table
    async drop(table) {
        const tableName = this.prefix + table;
        const query = `DROP TABLE IF EXISTS ${tableName}`;
        const result = await this.exec(query, {});

        return {
            success: true,
            query
        };
    }

    // Get database info
    async info() {
        const output = {};

        try {
            await this.ensureConnection();
            // Get server info
            const [serverInfo] = await this.connection.execute('SELECT VERSION() as version');
            output.version = serverInfo[0] ? serverInfo[0].version : null;

            // Get connection info
            output.connection = 'Connected';
            output.driver = 'mysql2';
            output.type = this.type;

            return output;
        } catch (error) {
            output.error = error.message;
            return output;
        }
    }

    // Random selection
    async rand(table, join = null, columns = null, where = null) {
        let order = 'RANDOM()';
        
        if (this.type === 'mysql') {
            order = 'RAND()';
        }

        const orderRaw = this.raw(order);

        if (where === null) {
            if (columns === null) {
                columns = { ORDER: orderRaw };
            } else {
                const column = join;
                if (columns.ORDER) delete columns.ORDER;
                columns.ORDER = orderRaw;
            }
        } else {
            if (where.ORDER) delete where.ORDER;
            where.ORDER = orderRaw;
        }

        return await this.select(table, join, columns, where);
    }

    // Close database connection
    async close() {
        if (this.connection) {
            await this.connection.end();
            this.connection = null;
        }
    }
}

module.exports = { Medoo, Raw };