/** jest con ts-jest: i test importano src/lib/scadenza-notify.ts
 *  con db/push/email sostituiti da mock (moduleNameMapper). */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  moduleNameMapper: {
    '^\\./db$': '<rootDir>/test/mocks/db.ts',
    '^\\./push$': '<rootDir>/test/mocks/push.ts',
    '^\\./email$': '<rootDir>/test/mocks/email.ts',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          target: 'es2020',
          strict: true,
          skipLibCheck: true,
        },
      },
    ],
  },
}
