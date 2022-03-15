# Compiling ps.js with rollup or webpack

### Installation
```shell
git clone git@github.com:UniqueNetwork/tmp__lib_compile_with_rollup_and_webpack.git
cd tmp__lib_compile_with_rollup_and_webpack
yarn
```

### Usage

First, compile with webpack:

```shell
yarn run build_webpack
```

Output file: `dist/main.js`

### Test in browser
```shell
yarn serve
```

Open [http://localhost:3000](http://localhost:3000) and click the button.

<details>
<summary>Also theoretically possible via Rollup, but it didn't bundle all the files</summary>

```shell
yarn run build_rollup
```
Output file: `dist/main.js`

</details>