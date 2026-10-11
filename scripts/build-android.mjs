import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = join(root, 'apps', 'web');
const android = join(web, 'android');
const mode = process.argv[2] ?? 'release';

if (mode !== 'release' && mode !== 'debug' && mode !== 'device') {
  throw new Error('Usage: node scripts/build-android.mjs [release|debug|device]');
}

const gradle = join(android, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
const npmExecutable = process.env.npm_execpath;
const sdk =
  process.env.ANDROID_SDK_ROOT ?? process.env.ANDROID_HOME ?? join(root, '.tools', 'android-sdk');
const javaHome =
  process.env.JAVA_HOME ??
  findWindowsJdk21() ??
  (process.platform === 'win32' ? 'C:\\Program Files\\Android\\Android Studio\\jbr' : undefined);
const signingProperties =
  process.env.ADAPTIVE_WORKOUT_SIGNING_PROPERTIES ??
  join(homedir(), '.adaptive-workout', 'signing.properties');

if (!existsSync(join(sdk, 'platforms', 'android-36'))) {
  throw new Error(`Android SDK 36 is missing at ${sdk}`);
}
if (!javaHome || !existsSync(javaHome)) {
  throw new Error('JAVA_HOME does not point to a usable JDK.');
}
if (mode === 'release' && !existsSync(signingProperties)) {
  throw new Error(`Release signing configuration is missing at ${signingProperties}`);
}
if (!npmExecutable || !existsSync(npmExecutable)) {
  throw new Error('The npm executable could not be resolved from npm_execpath.');
}

const escapedSdk = sdk.replaceAll('\\', '/').replace(':', '\\:');
writeFileSync(join(android, 'local.properties'), `sdk.dir=${escapedSdk}\n`);

const env = {
  ...process.env,
  ANDROID_HOME: sdk,
  ANDROID_SDK_ROOT: sdk,
  GRADLE_USER_HOME: process.env.GRADLE_USER_HOME ?? join(root, '.tools', 'gradle-home'),
  JAVA_HOME: javaHome,
  ADAPTIVE_WORKOUT_SIGNING_PROPERTIES: signingProperties,
};

run(
  process.execPath,
  [npmExecutable, 'run', 'build', '--workspace', '@adaptive-workout/web'],
  root,
  env,
);
run(
  process.execPath,
  [npmExecutable, 'exec', '--workspace', '@adaptive-workout/web', '--', 'cap', 'sync', 'android'],
  root,
  env,
);

if (mode === 'device') {
  run(gradle, [':app:connectedDebugAndroidTest'], android, env, process.platform === 'win32');
  console.log('Android device tests passed.');
  process.exit(0);
}

const variant = mode === 'release' ? 'Release' : 'Debug';
const gradleTasks = [`lint${variant}`, `test${variant}UnitTest`, `assemble${variant}`];
run(gradle, gradleTasks, android, env, process.platform === 'win32');

const source = join(android, 'app', 'build', 'outputs', 'apk', mode, `app-${mode}.apk`);
if (!existsSync(source)) throw new Error(`Gradle did not create ${source}`);

const artifacts = join(root, 'artifacts');
mkdirSync(artifacts, { recursive: true });
const destination = join(artifacts, `adaptive-workout-1.0-${mode}.apk`);
copyFileSync(source, destination);
const digest = createHash('sha256').update(readFileSync(destination)).digest('hex');
writeFileSync(`${destination}.sha256`, `${digest}  ${destination.split(/[\\/]/).at(-1)}\n`);
console.log(`APK: ${destination}`);
console.log(`SHA-256: ${digest}`);

function run(command, args, cwd, commandEnv, shell = false) {
  const result = spawnSync(command, args, { cwd, env: commandEnv, stdio: 'inherit', shell });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with code ${result.status}`);
}

function findWindowsJdk21() {
  if (process.platform !== 'win32') return undefined;
  const microsoft = join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Microsoft');
  if (!existsSync(microsoft)) return undefined;
  return readdirSync(microsoft)
    .filter((entry) => entry.startsWith('jdk-21'))
    .sort()
    .reverse()
    .map((entry) => join(microsoft, entry))
    .find((candidate) => existsSync(join(candidate, 'bin', 'java.exe')));
}
