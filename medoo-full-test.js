/**
 * Medoo Node.js 全面 API 测试脚本
 * 根据 MEDOO_README.md 文档测试所有 API 功能
 * 连接真实数据库进行完整测试
 */

const { Medoo, Raw } = require('./medoo');

class MedooFullTester {
    constructor() {
        this.db = null;
        this.testResults = [];
        this.passedTests = 0;
        this.failedTests = 0;
        this.startTime = Date.now();
    }

    async init() {
        console.log('🚀 Medoo Node.js 全面 API 测试');
        console.log('=====================================\n');

        try {
            this.db = new Medoo({
                type: 'mysql',
                server: 'localhost',
                username: 'root',
                password: '',
                database_name: 'ticket_management',
                port: 3306,
                charset: 'utf8mb4',
                logging: true
            });

            // Wait for connection to be ready
            await this.db.ensureConnection();
            console.log('✅ 数据库连接成功');
            return true;
        } catch (error) {
            console.error('❌ 数据库连接失败:', error.message);
            return false;
        }
    }

    async test(name, testFunction, showSQL = true) {
        try {
            console.log(`\n🧪 测试: ${name}`);
            console.log('─'.repeat(50));
            
            const result = await testFunction();
            
            if (showSQL && this.db.last()) {
                console.log('📝 生成的 SQL:', this.db.last());
            }
            
            console.log('✅ 通过:', name);
            this.passedTests++;
            this.testResults.push({ name, status: 'PASS', result });
            
            return result;
        } catch (error) {
            console.error(`❌ 失败: ${name} - ${error.message}`);
            this.failedTests++;
            this.testResults.push({ name, status: 'FAIL', error: error.message });
            throw error; // 重新抛出错误以便调试
        }
    }

    async setupTestTables() {
        console.log('\n🔧 设置测试表');
        console.log('─'.repeat(30));

        // 删除已存在的测试表
        try {
            await this.db.drop('test_users');
            await this.db.drop('test_profiles');
            await this.db.drop('test_posts');
            await this.db.drop('test_orders');
            console.log('🧹 清理旧测试表');
        } catch (error) {
            // 表不存在，忽略错误
        }

        // 创建测试表
        await this.test('创建用户表', async () => {
            return await this.db.create('test_users', {
                id: ['INT', 'AUTO_INCREMENT', 'PRIMARY KEY'],
                username: ['VARCHAR(100)', 'NOT NULL', 'UNIQUE'],
                email: ['VARCHAR(150)', 'NOT NULL'],
                age: ['INT'],
                score: ['DECIMAL(10,2)', 'DEFAULT 0'],
                role: ["ENUM('admin', 'user', 'moderator')", "DEFAULT 'user'"],
                is_active: ['BOOLEAN', 'DEFAULT 1'],
                balance: ['DECIMAL(10,2)', 'DEFAULT 0'],
                login_count: ['INT', 'DEFAULT 0'],
                settings: ['TEXT'],
                created_at: ['DATETIME', 'DEFAULT CURRENT_TIMESTAMP'],
                updated_at: ['DATETIME', 'DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP']
            });
        });

        await this.test('创建用户资料表', async () => {
            return await this.db.create('test_profiles', {
                id: ['INT', 'AUTO_INCREMENT', 'PRIMARY KEY'],
                user_id: ['INT', 'NOT NULL'],
                avatar: ['VARCHAR(255)'],
                bio: ['TEXT'],
                website: ['VARCHAR(255)'],
                location: ['VARCHAR(100)'],
                verified: ['BOOLEAN', 'DEFAULT 0'],
                created_at: ['DATETIME', 'DEFAULT CURRENT_TIMESTAMP'],
                'INDEX idx_user_id': ['(user_id)']
            });
        });

        await this.test('创建文章表', async () => {
            return await this.db.create('test_posts', {
                id: ['INT', 'AUTO_INCREMENT', 'PRIMARY KEY'],
                user_id: ['INT', 'NOT NULL'],
                title: ['VARCHAR(255)', 'NOT NULL'],
                content: ['TEXT'],
                status: ["ENUM('draft', 'published', 'archived')", "DEFAULT 'draft'"],
                view_count: ['INT', 'DEFAULT 0'],
                created_at: ['DATETIME', 'DEFAULT CURRENT_TIMESTAMP'],
                'INDEX idx_user_id': ['(user_id)'],
                'INDEX idx_status': ['(status)']
            });
        });

        await this.test('创建订单表', async () => {
            return await this.db.create('test_orders', {
                id: ['INT', 'AUTO_INCREMENT', 'PRIMARY KEY'],
                user_id: ['INT', 'NOT NULL'],
                amount: ['DECIMAL(10,2)', 'NOT NULL'],
                status: ["ENUM('pending', 'paid', 'cancelled')", "DEFAULT 'pending'"],
                created_at: ['DATETIME', 'DEFAULT CURRENT_TIMESTAMP'],
                'INDEX idx_user_id': ['(user_id)']
            });
        });
    }

    async testInsertAPI() {
        console.log('\n📥 测试 INSERT API');
        console.log('===================');

        // 插入单条记录
        await this.test('插入单条用户记录', async () => {
            return await this.db.insert('test_users', {
                username: 'john_doe',
                email: 'john@example.com',
                age: 25,
                score: 85.5,
                role: 'user',
                is_active: true,
                balance: 100.00
            });
        });

        // 批量插入
        await this.test('批量插入用户记录', async () => {
            return await this.db.insert('test_users', [
                {
                    username: 'jane_smith',
                    email: 'jane@example.com',
                    age: 30,
                    score: 92.0,
                    role: 'admin',
                    is_active: true,
                    balance: 250.00
                },
                {
                    username: 'bob_wilson',
                    email: 'bob@example.com',
                    age: 28,
                    score: 78.5,
                    role: 'moderator',
                    is_active: true,
                    balance: 150.00
                },
                {
                    username: 'alice_brown',
                    email: 'alice@example.com',
                    age: 35,
                    score: 95.0,
                    role: 'user',
                    is_active: false,
                    balance: 75.00
                }
            ]);
        });

        // JSON 数据插入
        await this.test('插入 JSON 数据', async () => {
            return await this.db.insert('test_users', {
                username: 'json_user',
                email: 'json@example.com',
                age: 27,
                'settings[JSON]': {
                    theme: 'dark',
                    language: 'zh-CN',
                    notifications: {
                        email: true,
                        push: false
                    }
                }
            });
        });

        // 插入用户资料
        await this.test('插入用户资料', async () => {
            return await this.db.insert('test_profiles', [
                {
                    user_id: 1,
                    avatar: 'https://example.com/avatar1.jpg',
                    bio: 'Software Developer',
                    website: 'https://johndoe.dev',
                    location: 'New York',
                    verified: true
                },
                {
                    user_id: 2,
                    avatar: 'https://example.com/avatar2.jpg',
                    bio: 'System Administrator',
                    website: 'https://janesmith.com',
                    location: 'California',
                    verified: true
                },
                {
                    user_id: 3,
                    avatar: 'https://example.com/avatar3.jpg',
                    bio: 'Community Moderator',
                    location: 'Texas',
                    verified: false
                }
            ]);
        });

        // 插入文章
        await this.test('插入文章数据', async () => {
            return await this.db.insert('test_posts', [
                {
                    user_id: 1,
                    title: '如何学习 Node.js',
                    content: '这是一篇关于 Node.js 学习的文章...',
                    status: 'published',
                    view_count: 150
                },
                {
                    user_id: 2,
                    title: 'MySQL 优化技巧',
                    content: '数据库优化的最佳实践...',
                    status: 'published',
                    view_count: 200
                },
                {
                    user_id: 1,
                    title: '草稿文章',
                    content: '这还是草稿...',
                    status: 'draft',
                    view_count: 0
                }
            ]);
        });

        // 插入订单
        await this.test('插入订单数据', async () => {
            return await this.db.insert('test_orders', [
                { user_id: 1, amount: 99.99, status: 'paid' },
                { user_id: 2, amount: 149.99, status: 'pending' },
                { user_id: 1, amount: 299.99, status: 'paid' },
                { user_id: 3, amount: 49.99, status: 'cancelled' }
            ]);
        });
    }

    async testSelectAPI() {
        console.log('\n📋 测试 SELECT API');
        console.log('===================');

        // 基础查询
        await this.test('查询所有用户', async () => {
            return await this.db.select('test_users', '*');
        });

        await this.test('查询指定字段', async () => {
            return await this.db.select('test_users', ['username', 'email', 'age']);
        });

        // WHERE 条件测试
        await this.test('基础 WHERE 条件', async () => {
            return await this.db.select('test_users', '*', {
                role: 'admin',
                is_active: true
            });
        });

        await this.test('比较操作符测试', async () => {
            return await this.db.select('test_users', ['username', 'age', 'score'], {
                'age[>]': 25,
                'score[>=]': 80,
                'age[<=]': 35
            });
        });

        await this.test('IN 查询测试', async () => {
            return await this.db.select('test_users', ['username', 'role'], {
                role: ['admin', 'moderator']
            });
        });

        await this.test('LIKE 查询测试', async () => {
            return await this.db.select('test_users', ['username', 'email'], {
                'username[~]': 'john',
                'email[~]': '@example.com'
            });
        });

        await this.test('NOT 查询测试', async () => {
            return await this.db.select('test_users', ['username', 'role'], {
                'role[!]': 'user',
                'age[!]': 25
            });
        });

        await this.test('BETWEEN 查询测试', async () => {
            return await this.db.select('test_users', ['username', 'age'], {
                'age[<>]': [25, 35]
            });
        });

        // 逻辑操作符测试
        await this.test('OR 条件测试', async () => {
            return await this.db.select('test_users', ['username', 'age'], {
                'OR': {
                    'age[<]': 26,
                    'age[>]': 34
                }
            });
        });

        await this.test('复合逻辑条件测试', async () => {
            return await this.db.select('test_users', ['username', 'role', 'score'], {
                'AND': {
                    is_active: true,
                    'OR': {
                        role: 'admin',
                        'score[>]': 90
                    }
                }
            });
        });

        // ORDER BY 测试
        await this.test('单字段排序测试', async () => {
            return await this.db.select('test_users', ['username', 'age'], {
                ORDER: { age: 'DESC' }
            });
        });

        await this.test('多字段排序测试', async () => {
            return await this.db.select('test_users', ['username', 'role', 'score'], {
                ORDER: {
                    role: 'ASC',
                    score: 'DESC'
                }
            });
        });

        await this.test('自定义排序测试', async () => {
            return await this.db.select('test_users', ['username', 'role'], {
                ORDER: {
                    role: ['admin', 'moderator', 'user']
                }
            });
        });

        // LIMIT 测试
        await this.test('限制数量测试', async () => {
            return await this.db.select('test_users', ['username', 'email'], {
                ORDER: { id: 'ASC' },
                LIMIT: 3
            });
        });

        await this.test('分页测试', async () => {
            return await this.db.select('test_users', ['username', 'email'], {
                ORDER: { id: 'ASC' },
                LIMIT: [2, 2] // OFFSET 2, LIMIT 2
            });
        });

        // GROUP BY & HAVING 测试
        await this.test('GROUP BY 测试', async () => {
            return await this.db.select('test_users', [
                'role',
                Medoo.raw('COUNT(*) as user_count'),
                Medoo.raw('AVG(age) as avg_age')
            ], {
                GROUP: 'role',
                HAVING: {
                    'COUNT(*)[>=]': 1
                }
            });
        });
    }

    async testGetAPI() {
        console.log('\n🎯 测试 GET API');
        console.log('================');

        await this.test('获取单个用户', async () => {
            return await this.db.get('test_users', '*', {
                username: 'john_doe'
            });
        });

        await this.test('获取特定字段', async () => {
            return await this.db.get('test_users', ['username', 'email', 'role'], {
                id: 1
            });
        });

        await this.test('获取单个字段值', async () => {
            return await this.db.get('test_users', 'email', {
                username: 'jane_smith'
            });
        });
    }

    async testHasAPI() {
        console.log('\n🔍 测试 HAS API');
        console.log('================');

        await this.test('检查用户是否存在', async () => {
            return await this.db.has('test_users', {
                username: 'john_doe'
            });
        });

        await this.test('检查不存在的用户', async () => {
            return await this.db.has('test_users', {
                username: 'nonexistent_user'
            });
        });

        await this.test('复杂条件检查', async () => {
            return await this.db.has('test_users', {
                role: 'admin',
                is_active: true,
                'age[>=]': 25
            });
        });
    }

    async testUpdateAPI() {
        console.log('\n✏️ 测试 UPDATE API');
        console.log('===================');

        await this.test('基础更新测试', async () => {
            return await this.db.update('test_users', {
                email: 'john.updated@example.com',
                age: 26
            }, {
                username: 'john_doe'
            });
        });

        await this.test('数值操作测试', async () => {
            return await this.db.update('test_users', {
                'score[+]': 5,      // score = score + 5
                'login_count[+]': 1, // login_count = login_count + 1
                'balance[-]': 10     // balance = balance - 10
            }, {
                username: 'john_doe'
            });
        });

        await this.test('使用 Raw SQL 更新', async () => {
            return await this.db.update('test_users', {
                updated_at: Medoo.raw('NOW()')
            }, {
                username: 'jane_smith'
            });
        });

        await this.test('批量更新测试', async () => {
            return await this.db.update('test_users', {
                'login_count[+]': 1
            }, {
                is_active: true
            });
        });

        await this.test('JSON 数据更新', async () => {
            return await this.db.update('test_users', {
                'settings[JSON]': {
                    theme: 'light',
                    language: 'en-US',
                    notifications: {
                        email: false,
                        push: true
                    }
                }
            }, {
                username: 'json_user'
            });
        });
    }

    async testDeleteAPI() {
        console.log('\n🗑️ 测试 DELETE API');
        console.log('==================');

        // 先插入一个测试用户用于删除
        await this.db.insert('test_users', {
            username: 'delete_me',
            email: 'delete@example.com',
            age: 99
        });

        await this.test('删除单个用户', async () => {
            return await this.db.delete('test_users', {
                username: 'delete_me'
            });
        });

        await this.test('条件删除测试', async () => {
            // 先插入几个测试用户
            await this.db.insert('test_users', [
                { username: 'temp1', email: 'temp1@test.com', age: 18 },
                { username: 'temp2', email: 'temp2@test.com', age: 19 }
            ]);

            return await this.db.delete('test_users', {
                'username[~]': 'temp',
                'age[<]': 20
            });
        });
    }

    async testReplaceAPI() {
        console.log('\n🔄 测试 REPLACE API');
        console.log('===================');

        await this.test('文本替换测试', async () => {
            return await this.db.replace('test_users', {
                email: {
                    '@example.com': '@newdomain.com'
                }
            }, {
                'email[~]': 'example.com'
            });
        });
    }

    async testAggregateAPI() {
        console.log('\n📊 测试聚合函数 API');
        console.log('=====================');

        await this.test('COUNT 测试', async () => {
            return await this.db.count('test_users');
        });

        await this.test('带条件的 COUNT 测试', async () => {
            return await this.db.count('test_users', {
                is_active: true
            });
        });

        await this.test('SUM 测试', async () => {
            return await this.db.sum('test_users', 'balance');
        });

        await this.test('AVG 测试', async () => {
            return await this.db.avg('test_users', 'age');
        });

        await this.test('MAX 测试', async () => {
            return await this.db.max('test_users', 'score');
        });

        await this.test('MIN 测试', async () => {
            return await this.db.min('test_users', 'age');
        });

        await this.test('带条件的聚合测试', async () => {
            return await this.db.avg('test_users', 'score', {
                is_active: true,
                'age[>=]': 25
            });
        });
    }

    async testJoinAPI() {
        console.log('\n🔗 测试 JOIN API');
        console.log('=================');

        await this.test('LEFT JOIN 测试', async () => {
            return await this.db.select('test_users', {
                '[>]test_profiles': { id: 'user_id' }
            }, [
                'test_users.username',
                'test_users.email',
                'test_profiles.avatar',
                'test_profiles.bio'
            ], {
                'test_users.is_active': true
            });
        });

        await this.test('INNER JOIN 测试', async () => {
            return await this.db.select('test_users', {
                '[><]test_profiles': { id: 'user_id' }
            }, [
                'test_users.username',
                'test_users.role',
                'test_profiles.avatar',
                'test_profiles.verified'
            ]);
        });

        await this.test('多表 JOIN 测试', async () => {
            return await this.db.select('test_users', {
                '[>]test_profiles': { id: 'user_id' },
                '[>]test_posts': { id: 'user_id' }
            }, [
                'test_users.username',
                'test_profiles.bio',
                'test_posts.title(post_title)',
                'test_posts.status'
            ], {
                'test_posts.status': 'published'
            });
        });

        await this.test('JOIN 聚合查询', async () => {
            return await this.db.select('test_users', {
                '[>]test_posts': { id: 'user_id' }
            }, [
                'test_users.username',
                Medoo.raw('COUNT(test_posts.id) as post_count')
            ], {
                GROUP: 'test_users.id',
                HAVING: {
                    'COUNT(test_posts.id)[>]': 0
                }
            });
        });
    }

    async testTransactionAPI() {
        console.log('\n💼 测试事务处理 API');
        console.log('====================');

        await this.test('成功事务测试', async () => {
            return await this.db.action(async (db) => {
                // 创建新用户
                await db.insert('test_users', {
                    username: 'transaction_user',
                    email: 'transaction@example.com',
                    balance: 1000.00
                });

                const userId = await db.id();

                // 创建订单
                await db.insert('test_orders', {
                    user_id: userId,
                    amount: 99.99,
                    status: 'paid'
                });

                // 扣除余额
                await db.update('test_users', {
                    'balance[-]': 99.99
                }, {
                    id: userId
                });

                return { success: true, userId };
            });
        });

        await this.test('失败事务测试（回滚）', async () => {
            try {
                await this.db.action(async (db) => {
                    await db.insert('test_users', {
                        username: 'rollback_user',
                        email: 'rollback@example.com'
                    });

                    // 故意抛出错误触发回滚
                    throw new Error('测试回滚');
                });
            } catch (error) {
                // 验证用户没有被创建
                const exists = await this.db.has('test_users', {
                    username: 'rollback_user'
                });
                if (!exists) {
                    return { rollbackSuccess: true };
                } else {
                    throw new Error('回滚失败，用户仍然存在');
                }
            }
        });

        await this.test('手动事务控制测试', async () => {
            await this.db.beginTransaction();
            try {
                await this.db.insert('test_users', {
                    username: 'manual_transaction',
                    email: 'manual@example.com'
                });

                await this.db.update('test_users', {
                    'login_count[+]': 1
                }, {
                    username: 'manual_transaction'
                });

                await this.db.commit();
                return { success: true };
            } catch (error) {
                await this.db.rollback();
                throw error;
            }
        });
    }

    async testRawSQLAPI() {
        console.log('\n🔧 测试原生 SQL API');
        console.log('====================');

        await this.test('Raw 查询测试', async () => {
            return await this.db.select('test_users', [
                'username',
                'age',
                Medoo.raw('UPPER(email) as upper_email'),
                Medoo.raw('CONCAT(username, " (", age, " years old)") as display_name')
            ], {
                is_active: true,
                LIMIT: 3
            });
        });

        await this.test('Raw 条件查询', async () => {
            return await this.db.select('test_users', ['username', 'score'], {
                'score[>]': Medoo.raw('(SELECT AVG(score) FROM test_users)')
            });
        });

        await this.test('完全原生查询测试', async () => {
            // 使用自己的 exec 方法，但避免在 LIMIT 中使用参数绑定
            const result = await this.db.exec(
                'SELECT username, email FROM "test_users" WHERE age > :age AND role = :role ORDER BY id LIMIT 2',
                {
                    ':age': 25,
                    ':role': 'admin'
                }
            );
            return result.rows;
        }, false);
    }

    async testUtilityAPI() {
        console.log('\n🛠️ 测试实用工具 API');
        console.log('====================');

        await this.test('获取插入 ID', async () => {
            await this.db.insert('test_users', {
                username: `id_test_${Date.now()}`,
                email: 'idtest@example.com'
            });
            return await this.db.id();
        });

        await this.test('随机查询测试', async () => {
            return await this.db.rand('test_users', ['username', 'email'], {
                is_active: true,
                LIMIT: 3
            });
        });

        await this.test('数据库信息', async () => {
            return await this.db.info();
        }, false);
    }

    async testPerformanceAPI() {
        console.log('\n⚡ 测试性能优化 API');
        console.log('=====================');

        await this.test('并行查询测试', async () => {
            const start = Date.now();
            const [users, posts, orders] = await Promise.all([
                this.db.select('test_users', ['username', 'email'], { LIMIT: 3 }),
                this.db.select('test_posts', ['title', 'status'], { LIMIT: 3 }),
                this.db.select('test_orders', ['amount', 'status'], { LIMIT: 3 })
            ]);
            const duration = Date.now() - start;
            
            return {
                users: users.length,
                posts: posts.length,
                orders: orders.length,
                duration: `${duration}ms`
            };
        }, false);

        await this.test('parallel() 方法测试', async () => {
            return await this.db.parallel([
                { method: 'count', table: 'test_users' },
                { method: 'count', table: 'test_posts' },
                { method: 'max', table: 'test_users', column: 'score' }
            ]);
        }, false);

        await this.test('batch() 方法测试', async () => {
            return await this.db.batch([
                (db) => db.count('test_users', { is_active: true }),
                (db) => db.avg('test_users', 'age'),
                (db) => db.has('test_users', { role: 'admin' })
            ]);
        }, false);
    }

    async testDebugAPI() {
        console.log('\n🐛 测试调试功能 API');
        console.log('====================');

        await this.test('调试模式测试', async () => {
            // 启用调试模式（不执行查询）
            const result = this.db.debug().select('test_users', '*', { id: 1 });
            return { debugEnabled: true };
        }, false);

        await this.test('SQL 日志测试', async () => {
            await this.db.select('test_users', ['username'], { LIMIT: 1 });
            const lastSQL = this.db.last();
            const allSQL = this.db.log();
            
            return {
                lastSQL: lastSQL ? 'Available' : 'Not found',
                totalQueries: allSQL.length
            };
        }, false);

        await this.test('错误处理测试', async () => {
            try {
                await this.db.select('non_existent_table', '*');
            } catch (error) {
                const errorInfo = this.db.error();
                return {
                    errorCaught: true,
                    errorInfo: errorInfo ? 'Available' : 'Not available'
                };
            }
        }, false);
    }

    async testDataTypeConversion() {
        console.log('\n🔄 测试数据类型转换');
        console.log('====================');

        await this.test('数据类型转换测试', async () => {
            return await this.db.select('test_users', [
                'id[Int]',
                'username[String]',
                'balance[Number]',
                'is_active[Bool]',
                'settings[JSON]'
            ], {
                LIMIT: 2
            });
        });
    }

    async runAllTests() {
        if (!(await this.init())) {
            return;
        }

        try {
            await this.setupTestTables();
            
            await this.testInsertAPI();
            await this.testSelectAPI();
            await this.testGetAPI();
            await this.testHasAPI();
            await this.testUpdateAPI();
            await this.testDeleteAPI();
            await this.testReplaceAPI();
            await this.testAggregateAPI();
            await this.testJoinAPI();
            await this.testTransactionAPI();
            await this.testRawSQLAPI();
            await this.testUtilityAPI();
            await this.testPerformanceAPI();
            await this.testDebugAPI();
            await this.testDataTypeConversion();

        } catch (error) {
            console.error('\n💥 测试过程中发生严重错误:', error.message);
            console.error('错误详情:', error);
        } finally {
            await this.cleanup();
            await this.generateReport();
        }
    }

    async cleanup() {
        console.log('\n🧹 清理测试数据');
        console.log('================');

        try {
            await this.db.drop('test_orders');
            await this.db.drop('test_posts');
            await this.db.drop('test_profiles');
            await this.db.drop('test_users');
            console.log('✅ 测试表清理完成');
        } catch (error) {
            console.log('⚠️ 清理过程中出现错误:', error.message);
        }

        if (this.db) {
            await this.db.close();
            console.log('✅ 数据库连接已关闭');
        }
    }

    async generateReport() {
        const endTime = Date.now();
        const duration = endTime - this.startTime;
        const totalTests = this.passedTests + this.failedTests;
        const successRate = ((this.passedTests / totalTests) * 100).toFixed(2);

        console.log('\n📊 测试报告');
        console.log('=============');
        console.log(`📈 总测试数: ${totalTests}`);
        console.log(`✅ 通过: ${this.passedTests}`);
        console.log(`❌ 失败: ${this.failedTests}`);
        console.log(`🎯 成功率: ${successRate}%`);
        console.log(`⏱️ 总耗时: ${(duration / 1000).toFixed(2)}秒`);

        if (this.failedTests > 0) {
            console.log('\n❌ 失败的测试:');
            this.testResults
                .filter(r => r.status === 'FAIL')
                .forEach(r => console.log(`   - ${r.name}: ${r.error}`));
        }

        console.log('\n🏆 测试完成! ');
        if (this.failedTests === 0) {
            console.log('🎉 所有测试都通过了！Medoo Node.js 工作完美！');
        } else {
            console.log(`⚠️ 有 ${this.failedTests} 个测试失败，需要修复。`);
        }
    }
}

// 运行完整测试
if (require.main === module) {
    const tester = new MedooFullTester();
    tester.runAllTests().catch(console.error);
}

module.exports = { MedooFullTester };