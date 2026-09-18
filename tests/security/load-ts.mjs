import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import vm from 'node:vm';

// Execute the real TypeScript source, with explicit stubs only for framework markers.
export function loadTs(relativePath, overrides = {}) {
  const filename = resolve(relativePath);
  const nativeRequire = createRequire(filename);
  const require = (name) => {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    if (name === 'server-only') return {};
    if (name.endsWith('.ts')) return loadTs(resolve(dirname(filename), name), overrides);
    return nativeRequire(name);
  };
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(
    require,
    module,
    module.exports
  );
  return module.exports;
}
