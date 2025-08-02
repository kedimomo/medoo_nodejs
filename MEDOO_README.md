# Medoo Node.js

> 轻量级的 Node.js 数据库框架，完全复刻 PHP Medoo 的函数式 API

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node.js-%3E%3D12-green.svg)](https://nodejs.org/)
[![MySQL](https://img.shields.io/badge/mysql-8.0%2B-orange.svg)](https://www.mysql.com/)

## 特性

- **函数式 API** - 与 PHP Medoo 100% 兼容的简洁语法
- **防 SQL 注入** - 内置参数化查询保护
- **轻量级** - 零依赖（除 mysql2），核心文件 < 50KB
- **Promise/Async** - 原生支持 async/await
- **事务支持** - 完整的事务处理能力
- **调试友好** - 内置 SQL 调试和日志功能
- **性能优化** - 支持并行查询和批量操作

## 安装

```bash
npm install mysql2
```

然后将 `medoo.js` 复制到您的项目中。

## 快速开始

### 数据库连接

```javascript
const { Medoo } = require('./medoo');

const db = new Medoo({
    type: 'mysql',
    server: 'localhost',
    username: 'root',
    password: 'password',
    database_name: 'mydb',
    port: 3306,
    charset: 'utf8mb4',
    prefix: ''  // 表前缀
});
```

### 基础用法

```javascript
// 查询数据
const users = await db.select('users', '*');

// 插入数据
await db.insert('users', {
    username: 'john',
    email: 'john@example.com'
});

// 更新数据
await db.update('users', {
    email: 'newemail@example.com'
}, {
    username: 'john'
});

// 删除数据
await db.delete('users', {
    username: 'john'
});
```

---

## SELECT

### 基础查询

**查询所有数据:**
```javascript
const users = await db.select('users', '*');
```
```sql
SELECT * FROM "users"
```

**指定字段:**
```javascript
const users = await db.select('users', ['username', 'email']);
```
```sql
SELECT "username", "email" FROM "users"
```

**带条件查询:**
```javascript
const users = await db.select('users', '*', {
    age: 25
});
```
```sql
SELECT * FROM "users" WHERE "age" = 25
```

### WHERE 条件

**基础条件:**
```javascript
await db.select('users', '*', {
    username: 'john',
    age: 25
});
```
```sql
SELECT * FROM "users" WHERE "username" = 'john' AND "age" = 25
```

**比较操作符:**
```javascript
await db.select('users', '*', {
    'age[>]': 18,
    'age[<=]': 65
});
```
```sql
SELECT * FROM "users" WHERE "age" > 18 AND "age" <= 65
```

**IN 查询:**
```javascript
await db.select('users', '*', {
    role: ['admin', 'user', 'moderator']
});
```
```sql
SELECT * FROM "users" WHERE "role" IN ('admin', 'user', 'moderator')
```

**LIKE 查询:**
```javascript
await db.select('users', '*', {
    'username[~]': 'john'
});
```
```sql
SELECT * FROM "users" WHERE "username" LIKE '%john%'
```

**NOT 查询:**
```javascript
await db.select('users', '*', {
    'age[!]': 25,
    'role[!]': ['admin', 'banned']
});
```
```sql
SELECT * FROM "users" WHERE "age" != 25 AND "role" NOT IN ('admin', 'banned')
```

**BETWEEN 查询:**
```javascript
await db.select('users', '*', {
    'age[<>]': [18, 65]
});
```
```sql
SELECT * FROM "users" WHERE "age" BETWEEN 18 AND 65
```

**正则表达式:**
```javascript
await db.select('users', '*', {
    'username[REGEXP]': '^admin'
});
```
```sql
SELECT * FROM "users" WHERE "username" REGEXP '^admin'
```

### 逻辑操作符

**OR 条件:**
```javascript
await db.select('users', '*', {
    'OR': {
        'age[<]': 18,
        'age[>]': 65
    }
});
```
```sql
SELECT * FROM "users" WHERE ("age" < 18 OR "age" > 65)
```

**复合逻辑:**
```javascript
await db.select('users', '*', {
    'AND': {
        'age[>=]': 18,
        'OR': {
            role: 'admin',
            'score[>]': 80
        }
    }
});
```
```sql
SELECT * FROM "users" WHERE ("age" >= 18 AND ("role" = 'admin' OR "score" > 80))
```

### ORDER BY

**单字段排序:**
```javascript
await db.select('users', '*', {
    ORDER: { age: 'DESC' }
});
```
```sql
SELECT * FROM "users" ORDER BY "age" DESC
```

**多字段排序:**
```javascript
await db.select('users', '*', {
    ORDER: {
        role: 'ASC',
        age: 'DESC'
    }
});
```
```sql
SELECT * FROM "users" ORDER BY "role" ASC, "age" DESC
```

**自定义排序:**
```javascript
await db.select('users', '*', {
    ORDER: {
        role: ['admin', 'moderator', 'user']
    }
});
```
```sql
SELECT * FROM "users" ORDER BY FIELD("role", 'admin', 'moderator', 'user')
```

### LIMIT

**限制数量:**
```javascript
await db.select('users', '*', {
    LIMIT: 10
});
```
```sql
SELECT * FROM "users" LIMIT 10
```

**分页:**
```javascript
await db.select('users', '*', {
    LIMIT: [20, 10]  // OFFSET 20, LIMIT 10
});
```
```sql
SELECT * FROM "users" LIMIT 10 OFFSET 20
```

### GROUP BY & HAVING

```javascript
await db.select('users', [
    'role',
    'COUNT(*) as count'
], {
    GROUP: 'role',
    HAVING: {
        'COUNT(*)[>]': 5
    }
});
```
```sql
SELECT "role", COUNT(*) as count FROM "users" GROUP BY "role" HAVING COUNT(*) > 5
```

---

## GET

获取单条记录，自动添加 `LIMIT 1`。

```javascript
const user = await db.get('users', '*', {
    username: 'john'
});
```
```sql
SELECT * FROM "users" WHERE "username" = 'john' LIMIT 1
```

**获取特定字段:**
```javascript
const email = await db.get('users', 'email', {
    username: 'john'
});
```
```sql
SELECT "email" FROM "users" WHERE "username" = 'john' LIMIT 1
```

---

## HAS

检查记录是否存在。

```javascript
const exists = await db.has('users', {
    username: 'john'
});
```
```sql
SELECT EXISTS(SELECT 1 FROM "users" WHERE "username" = 'john')
```

---

## INSERT

### 插入单条记录

```javascript
const result = await db.insert('users', {
    username: 'john',
    email: 'john@example.com',
    age: 25
});
```
```sql
INSERT INTO "users" ("username", "email", "age") VALUES ('john', 'john@example.com', 25)
```

### 批量插入

```javascript
await db.insert('users', [
    {
        username: 'john',
        email: 'john@example.com'
    },
    {
        username: 'jane',
        email: 'jane@example.com'
    }
]);
```
```sql
INSERT INTO "users" ("username", "email") VALUES ('john', 'john@example.com'), ('jane', 'jane@example.com')
```

### JSON 数据

```javascript
await db.insert('users', {
    username: 'john',
    'settings[JSON]': {
        theme: 'dark',
        lang: 'en'
    }
});
```
```sql
INSERT INTO "users" ("username", "settings") VALUES ('john', '{"theme":"dark","lang":"en"}')
```

---

## UPDATE

### 基础更新

```javascript
await db.update('users', {
    email: 'newemail@example.com',
    age: 26
}, {
    username: 'john'
});
```
```sql
UPDATE "users" SET "email" = 'newemail@example.com', "age" = 26 WHERE "username" = 'john'
```

### 数值操作

```javascript
await db.update('users', {
    'age[+]': 1,        // age = age + 1
    'score[-]': 5,      // score = score - 5
    'points[*]': 2,     // points = points * 2
    'ratio[/]': 2       // ratio = ratio / 2
}, {
    username: 'john'
});
```
```sql
UPDATE "users" SET "age" = "age" + 1, "score" = "score" - 5, "points" = "points" * 2, "ratio" = "ratio" / 2 WHERE "username" = 'john'
```

### 使用原生 SQL

```javascript
const { Raw } = require('./medoo');

await db.update('users', {
    last_login: Raw.raw('NOW()')
}, {
    username: 'john'
});
```
```sql
UPDATE "users" SET "last_login" = NOW() WHERE "username" = 'john'
```

---

## DELETE

```javascript
await db.delete('users', {
    username: 'john'
});
```
```sql
DELETE FROM "users" WHERE "username" = 'john'
```

**批量删除:**
```javascript
await db.delete('users', {
    'age[<]': 18
});
```
```sql
DELETE FROM "users" WHERE "age" < 18
```

---

## REPLACE

替换字段中的文本内容。

```javascript
await db.replace('users', {
    email: {
        '@oldomain.com': '@newdomain.com'
    }
}, {
    'email[~]': 'oldomain.com'
});
```
```sql
UPDATE "users" SET "email" = REPLACE("email", '@oldomain.com', '@newdomain.com') WHERE "email" LIKE '%oldomain.com%'
```

---

## 聚合函数

### COUNT

```javascript
const count = await db.count('users');
```
```sql
SELECT COUNT(*) FROM "users"
```

**带条件:**
```javascript
const count = await db.count('users', {
    'age[>=]': 18
});
```
```sql
SELECT COUNT(*) FROM "users" WHERE "age" >= 18
```

### SUM

```javascript
const total = await db.sum('orders', 'amount');
```
```sql
SELECT SUM("amount") FROM "orders"
```

### AVG

```javascript
const average = await db.avg('users', 'age');
```
```sql
SELECT AVG("age") FROM "users"
```

### MAX / MIN

```javascript
const maxAge = await db.max('users', 'age');
const minAge = await db.min('users', 'age');
```
```sql
SELECT MAX("age") FROM "users"
SELECT MIN("age") FROM "users"
```

---

## JOIN

### LEFT JOIN

```javascript
await db.select('users', [
    '[>]profiles': { user_id: 'id' }
], [
    'users.username',
    'profiles.avatar'
], {
    'users.status': 'active'
});
```
```sql
SELECT "users"."username", "profiles"."avatar" 
FROM "users" 
LEFT JOIN "profiles" ON "users"."id" = "profiles"."user_id" 
WHERE "users"."status" = 'active'
```

### INNER JOIN

```javascript
await db.select('users', [
    '[><]roles': { role_id: 'id' }
], [
    'users.username',
    'roles.name(role_name)'
]);
```
```sql
SELECT "users"."username", "roles"."name" AS "role_name" 
FROM "users" 
INNER JOIN "roles" ON "users"."role_id" = "roles"."id"
```

### 多表 JOIN

```javascript
await db.select('users', [
    '[>]profiles': { user_id: 'id' },
    '[>]departments': { dept_id: 'id' }
], [
    'users.username',
    'profiles.avatar',
    'departments.name(dept_name)'
]);
```
```sql
SELECT "users"."username", "profiles"."avatar", "departments"."name" AS "dept_name" 
FROM "users" 
LEFT JOIN "profiles" ON "users"."id" = "profiles"."user_id" 
LEFT JOIN "departments" ON "users"."dept_id" = "departments"."id"
```

### JOIN 类型

| 符号 | JOIN 类型 |
|------|-----------|
| `[>]` | LEFT JOIN |
| `[<]` | RIGHT JOIN |
| `[<>]` | FULL JOIN |
| `[><]` | INNER JOIN |

---

## 数据类型转换

```javascript
await db.select('users', [
    'id[Int]',           // 转换为整数
    'balance[Number]',   // 转换为浮点数
    'is_active[Bool]',   // 转换为布尔值
    'settings[JSON]'     // 解析 JSON
]);
```

---

## 事务处理

### 自动事务

```javascript
const result = await db.action(async (db) => {
    await db.insert('orders', {
        user_id: 1,
        amount: 100.00
    });

    await db.update('users', {
        'balance[-]': 100.00
    }, {
        id: 1
    });

    return { success: true };
});
```

### 手动事务

```javascript
await db.beginTransaction();
try {
    await db.insert('orders', { /* ... */ });
    await db.update('users', { /* ... */ });
    await db.commit();
} catch (error) {
    await db.rollback();
    throw error;
}
```

---

## 原生 SQL

### Raw 查询

```javascript
const { Raw } = require('./medoo');

await db.select('users', [
    'username',
    Raw.raw('COUNT(*) OVER() as total_count'),
    Raw.raw('UPPER(email) as upper_email')
]);
```
```sql
SELECT "username", COUNT(*) OVER() as total_count, UPPER(email) as upper_email FROM "users"
```

### 完全原生查询

```javascript
const result = await db.query(
    'SELECT * FROM users WHERE created_at > ? AND role = ?',
    ['2024-01-01', 'admin']
);
```

---

## 表操作

### 创建表

```javascript
await db.create('new_table', {
    id: ['INT', 'AUTO_INCREMENT', 'PRIMARY KEY'],
    name: ['VARCHAR(100)', 'NOT NULL'],
    email: ['VARCHAR(150)', 'UNIQUE'],
    created_at: ['DATETIME', 'DEFAULT CURRENT_TIMESTAMP']
});
```
```sql
CREATE TABLE IF NOT EXISTS "new_table" (
    "id" INT AUTO_INCREMENT PRIMARY KEY,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(150) UNIQUE,
    "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### 删除表

```javascript
await db.drop('old_table');
```
```sql
DROP TABLE IF EXISTS "old_table"
```

---

## 性能优化

### 并行查询

```javascript
// 串行执行（慢）
const users = await db.select('users', '*');
const orders = await db.select('orders', '*');

// 并行执行（快）
const [users, orders] = await Promise.all([
    db.select('users', '*'),
    db.select('orders', '*')
]);
```

### 使用 parallel() 方法

```javascript
const results = await db.parallel([
    { method: 'select', table: 'users', columns: '*', where: { LIMIT: 10 } },
    { method: 'count', table: 'orders' },
    { method: 'max', table: 'users', column: 'id' }
]);
```

### 批量操作

```javascript
const results = await db.batch([
    (db) => db.select('users', '*', { LIMIT: 5 }),
    (db) => db.count('orders'),
    (db) => db.has('users', { username: 'admin' })
]);
```

---

## 调试功能

### 启用调试模式

```javascript
// 显示 SQL 而不执行
db.debug().select('users', '*', { id: 1 });
// 输出: SELECT * FROM "users" WHERE "id" = 1
```

### 查看执行的 SQL

```javascript
await db.select('users', '*', { LIMIT: 1 });
console.log(db.last()); // 最后一条 SQL
console.log(db.log());  // 所有执行过的 SQL
```

### 错误处理

```javascript
try {
    await db.select('non_existent_table', '*');
} catch (error) {
    console.log(db.error()); // 获取详细错误信息
}
```

---

## 实用工具

### 获取插入 ID

```javascript
await db.insert('users', { username: 'john' });
const insertId = await db.id();
```

### 随机查询

```javascript
const randomUsers = await db.rand('users', '*', { LIMIT: 5 });
```
```sql
SELECT * FROM "users" ORDER BY RAND() LIMIT 5
```

### 数据库信息

```javascript
const info = await db.info();
console.log(info.version); // MySQL 版本
```

---

## 完整示例

```javascript
const { Medoo } = require('./medoo');

class UserService {
    constructor() {
        this.db = new Medoo({
            type: 'mysql',
            server: 'localhost',
            username: 'root',
            password: 'password',
            database_name: 'myapp'
        });
    }

    async getUserProfile(userId) {
        // 并行获取用户信息
        const [user, posts, followers] = await Promise.all([
            this.db.get('users', [
                'id', 'username', 'email', 'avatar'
            ], { id: userId }),
            
            this.db.select('posts', [
                'id', 'title', 'created_at'
            ], {
                user_id: userId,
                status: 'published',
                ORDER: { created_at: 'DESC' },
                LIMIT: 10
            }),
            
            this.db.count('followers', { following_id: userId })
        ]);

        return {
            user,
            posts,
            followerCount: followers
        };
    }

    async createUser(userData) {
        return await this.db.action(async (db) => {
            // 插入用户
            await db.insert('users', {
                username: userData.username,
                email: userData.email,
                password_hash: userData.passwordHash,
                created_at: new Date()
            });

            const userId = await db.id();

            // 创建用户配置
            await db.insert('user_profiles', {
                user_id: userId,
                display_name: userData.displayName || userData.username,
                'settings[JSON]': {
                    theme: 'light',
                    notifications: true
                }
            });

            return { userId, success: true };
        });
    }

    async close() {
        await this.db.close();
    }
}

// 使用示例
const userService = new UserService();
const profile = await userService.getUserProfile(1);
console.log(profile);
```

---

## API 参考

### 查询方法

| 方法 | 说明 | 返回值 |
|------|------|--------|
| `select(table, join, columns, where)` | 查询多条记录 | Array |
| `get(table, join, columns, where)` | 查询单条记录 | Object\|null |
| `has(table, join, where)` | 检查记录是否存在 | Boolean |

### 操作方法

| 方法 | 说明 | 返回值 |
|------|------|--------|
| `insert(table, data)` | 插入记录 | Object |
| `update(table, data, where)` | 更新记录 | Object |
| `delete(table, where)` | 删除记录 | Object |
| `replace(table, columns, where)` | 替换文本 | Object |

### 聚合方法

| 方法 | 说明 | 返回值 |
|------|------|--------|
| `count(table, join, where)` | 计数 | Number |
| `sum(table, join, column, where)` | 求和 | Number |
| `avg(table, join, column, where)` | 平均值 | Number |
| `max(table, join, column, where)` | 最大值 | Number |
| `min(table, join, column, where)` | 最小值 | Number |

### 工具方法

| 方法 | 说明 | 返回值 |
|------|------|--------|
| `action(callback)` | 事务处理 | Mixed |
| `id()` | 获取插入 ID | Number |
| `debug()` | 启用调试 | this |
| `error()` | 获取错误信息 | Object |
| `last()` | 最后执行的 SQL | String |
| `log()` | 所有执行的 SQL | Array |

---

## 许可证

MIT License - 与原 PHP Medoo 保持一致

---

**享受简洁的函数式数据库操作体验！** 🎉