/*
 * @Description: 转换px到rem
 * @Date: 2019-10-23 09:04:00
 * @Author: Morisun
 * @LastEditors: Morisun
 * @LastEditTime: 2019-10-23 11:37:54
 * @usage:
 * vuecli3.0中的使用方法：
 css: {
    loaderOptions: {
      postcss: {
        // 这里的选项会传递给 postcss-loader
        plugins: () => [
          // 只会对px转换，对大写的PX,Px,pX不转换（浏览器依然识别）
          // https://github.com/cuth/postcss-pxtorem/
          Pxtorem({
            rootValue: 75, // 设计稿的rem值
            unitPrecision: 5, // rem精确度
            propList: ['*'], // 对哪些属性转换，!font*
            selectorBlackList: [], // 对哪些类名不转换
            replace: true,
            mediaQuery: true, // 对media是否转换
            minPixelValue: 1.1, // 最小转换的px值，包含此值，所以这里为了不让1px转换，设置的比1大一点
            exclude: [/src\/App\.vue/],
          }),
        ],
      },
    },
  },
 * @return:
 */


const postcss = require('postcss');
const objectAssign = require('object-assign');
const pxRegex = require('./lib/pixel-unit-regex');
const filterPropList = require('./lib/filter-prop-list');

const defaults = {
  rootValue: 16,
  unitPrecision: 5,
  selectorBlackList: [],
  propList: ['font', 'font-size', 'line-height', 'letter-spacing'],
  replace: true,
  mediaQuery: false,
  minPixelValue: 0,
};

const legacyOptions = {
  root_value: 'rootValue',
  unit_precision: 'unitPrecision',
  selector_black_list: 'selectorBlackList',
  prop_white_list: 'propList',
  media_query: 'mediaQuery',
  propWhiteList: 'propList',
};

module.exports = postcss.plugin('postcss-pxtorem', (options) => {
  convertLegacyOptions(options);

  const opts = objectAssign({}, defaults, options);
  const pxReplace = createPxReplace(opts.rootValue, opts.unitPrecision, opts.minPixelValue);

  const satisfyPropList = createPropListMatcher(opts.propList);

  return function (css) {
    css.walkDecls((decl, i) => {
    //   console.log('decl:', decl);
    //   console.log('i:', i);
      // Add exclude option to ignore some files like 'node_modules'
      const file = decl.source && decl.source.input.file;

      if (opts.exclude && file) {
        if (Object.prototype.toString.call(opts.exclude) === '[object RegExp]') {
          if (isExclude(opts.exclude, file)) return;
        } else if (Object.prototype.toString.call(opts.exclude) === '[object Array]') {
          for (let i = 0; i < opts.exclude.length; i++) {
            if (isExclude(opts.exclude[i], file)) return;
          }
        } else {
          throw new Error('options.exclude should be RegExp or Array.');
        }
      }

      // This should be the fastest test and will remove most declarations
      if (decl.value.indexOf('px') === -1) return;

      if (!satisfyPropList(decl.prop)) return;

      if (blacklistedSelector(opts.selectorBlackList, decl.parent.selector)) return;

      const value = decl.value.replace(pxRegex, pxReplace);

      // if rem unit already exists, do not add or replace
      if (declarationExists(decl.parent, decl.prop, value)) return;

      if (opts.replace) {
        decl.value = value;
      } else {
        decl.parent.insertAfter(i, decl.clone({ value }));
      }
    });

    if (opts.mediaQuery) {
      css.walkAtRules('media', (rule) => {
        if (rule.params.indexOf('px') === -1) return;
        rule.params = rule.params.replace(pxRegex, pxReplace);
      });
    }
  };
});

function convertLegacyOptions(options) {
  if (typeof options !== 'object') return;
  if (
    (
      (typeof options.prop_white_list !== 'undefined' && options.prop_white_list.length === 0)
                || (typeof options.propWhiteList !== 'undefined' && options.propWhiteList.length === 0)
    )
            && typeof options.propList === 'undefined'
  ) {
    options.propList = ['*'];
    delete options.prop_white_list;
    delete options.propWhiteList;
  }
  Object.keys(legacyOptions).forEach((key) => {
    if (options.hasOwnProperty(key)) {
      options[legacyOptions[key]] = options[key];
      delete options[key];
    }
  });
}

function createPxReplace(rootValue, unitPrecision, minPixelValue) {
  return function (m, $1) {
    if (!$1) return m;
    const pixels = parseFloat($1);
    if (pixels < minPixelValue) return m;
    const fixedVal = toFixed((pixels / rootValue), unitPrecision);
    return (fixedVal === 0) ? '0' : `${fixedVal}rem`;
  };
}

function toFixed(number, precision) {
  const multiplier = Math.pow(10, precision + 1);
  const wholeNumber = Math.floor(number * multiplier);
  return Math.round(wholeNumber / 10) * 10 / multiplier;
}

function declarationExists(decls, prop, value) {
  return decls.some(decl => (decl.prop === prop && decl.value === value));
}

function blacklistedSelector(blacklist, selector) {
  if (typeof selector !== 'string') return;
  return blacklist.some((regex) => {
    if (typeof regex === 'string') return selector.indexOf(regex) !== -1;
    return selector.match(regex);
  });
}

function createPropListMatcher(propList) {
  const hasWild = propList.indexOf('*') > -1;
  const matchAll = (hasWild && propList.length === 1);
  const lists = {
    exact: filterPropList.exact(propList),
    contain: filterPropList.contain(propList),
    startWith: filterPropList.startWith(propList),
    endWith: filterPropList.endWith(propList),
    notExact: filterPropList.notExact(propList),
    notContain: filterPropList.notContain(propList),
    notStartWith: filterPropList.notStartWith(propList),
    notEndWith: filterPropList.notEndWith(propList),
  };
  return function (prop) {
    if (matchAll) return true;
    return (
      (
        hasWild
                || lists.exact.indexOf(prop) > -1
                || lists.contain.some(m => prop.indexOf(m) > -1)
                || lists.startWith.some(m => prop.indexOf(m) === 0)
                || lists.endWith.some(m => prop.indexOf(m) === prop.length - m.length)
      )
            && !(
              lists.notExact.indexOf(prop) > -1
                || lists.notContain.some(m => prop.indexOf(m) > -1)
                || lists.notStartWith.some(m => prop.indexOf(m) === 0)
                || lists.notEndWith.some(m => prop.indexOf(m) === prop.length - m.length)
            )
    );
  };
}

function isExclude(reg, file) {
  if (Object.prototype.toString.call(reg) !== '[object RegExp]') {
    throw new Error('options.exclude should be RegExp.');
  }
  return file.match(reg) !== null;
}
