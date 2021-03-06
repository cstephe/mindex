'use strict'

var binarySearch = require('./utils').binarySearch
var insertAt = require('./utils').insertAt
var removeAt = require('./utils').removeAt
var isArray = require('mout/lang/isArray')
var omit = require('mout/object/omit')
var clone = require('mout/lang/clone')
var addAndFlatten = function(results, value){
  value.forEach(function(item){
    results.push(item);
  });
  return results;
};

var BaseSecondaryIndex = {

  set: function (keyList, value) {
    if (!isArray(keyList)) {
      keyList = [keyList]
    }

    let key = keyList.shift() || null
    let pos = binarySearch(this.keys, key)

    if (keyList.length === 0) {
      if (pos.found) {
        let dataLocation = binarySearch(this.values[pos.index], value)
        if (!dataLocation.found) {
          insertAt(this.values[pos.index], dataLocation.index, value)
        }
      } else {
        insertAt(this.keys, pos.index, key)
        insertAt(this.values, pos.index, [value])
      }
    } else {
      if (pos.found) {
        this.values[pos.index].set(keyList, value)
      } else {
        insertAt(this.keys, pos.index, key)
        let newIndex = createIndex()
        newIndex.set(keyList, value)
        insertAt(this.values, pos.index, newIndex)
      }
    }
  },

  get: function (keyList) {
    if (!isArray(keyList)) {
      keyList = [keyList]
    }

    let key = keyList.shift() || null
    let pos = binarySearch(this.keys, key)

    if (keyList.length === 0) {
      if (pos.found) {
        if (this.values[pos.index].isIndex) {
          return this.values[pos.index].getAll()
        } else {
          return this.values[pos.index]
        }
      } else {
        return []
      }
    } else {
      if (pos.found) {
        return this.values[pos.index].get(keyList)
      } else {
        return []
      }
    }
  },

  getAll: function (opts) {
    opts = Object.assign({
      order: 'asc'
    }, opts)

    let results = []

    if (opts.order === 'asc') {
      for (let i = 0; i < this.values.length; i += 1) {
        let value = this.values[i]
        if (value.isIndex) {
          results = addAndFlatten(results, value.getAll(opts))
        } else {
          results = addAndFlatten(results, value)
        }
      }
    } else if (opts.order === 'desc') {
      for (let i = this.values.length - 1; i >= 0; i -= 1) {
        let value = this.values[i]
        if (value.isIndex) {
          results = addAndFlatten(results, value.getAll(opts))
        } else {
          results = addAndFlatten(results, value)
        }
      }
    } else {
      throw new Error('order must be either \'asc\' or \'desc\'')
    }

    return results
  },

  query: function (query) {
    let leftKeys = []
    let rightKeys = []

    if (query['>']) {
      leftKeys = query['>']
      query.leftInclusive = false
    } else if (query['>=']) {
      leftKeys = query['>=']
      query.leftInclusive = true
    }

    if (query['<']) {
      rightKeys = query['<']
      query.rightInclusive = false
    } else if (query['<=']) {
      rightKeys = query['<=']
      query.rightInclusive = true
    }

    if (leftKeys.length !== rightKeys.length) {
      throw new Error('Key arrays must be same length')
    }

    return this.between(leftKeys, rightKeys, omit(query, ['>', '>=', '<', '<=']))
  },

  between: function (leftKeys, rightKeys, opts) {
    opts = Object.assign({
      leftInclusive: true,
      rightInclusive: false,
      order: 'asc',
      limit: undefined,
      offset: 0
    }, opts)

    let results = []

    if (opts.order === 'asc') {
      results = this._betweenAsc(leftKeys, rightKeys, opts)
    } else if (opts.order === 'desc') {
      results = this._betweenDesc(leftKeys, rightKeys, opts)
    } else {
      throw new Error('order must be either \'asc\' or \'desc\'')
    }

    if (opts.limit) {
      return results.slice(opts.offset, opts.limit + opts.offset)
    } else {
      return results.slice(opts.offset)
    }
  },

  _betweenAsc: function (leftKeys, rightKeys, opts) {
    let results = []

    let leftKey = leftKeys.shift()
    let rightKey = rightKeys.shift()

    let pos

    if (leftKey !== undefined) {
      pos = binarySearch(this.keys, leftKey)
    } else {
      pos = {
        found: false,
        index: 0
      }
    }

    if (leftKeys.length === 0) {
      if (pos.found && opts.leftInclusive === false) {
        pos.index += 1
      }

      for (let i = pos.index; i < this.keys.length; i += 1) {
        if (rightKey !== undefined) {
          if (opts.rightInclusive) {
            if (this.keys[i] > rightKey) { break }
          } else {
            if (this.keys[i] >= rightKey) { break }
          }
        }

        if (this.values[i].isIndex) {
          results = addAndFlatten(results, this.values[i].getAll())
        } else {
          results = addAndFlatten(results, this.values[i])
        }

        if (opts.limit) {
          if (results.length >= (opts.limit + opts.offset)) {
            break
          }
        }
      }
    } else {
      for (let i = pos.index; i < this.keys.length; i += 1) {
        let currKey = this.keys[i]
        if (currKey > rightKey) { break }

        if (this.values[i].isIndex) {
          if (currKey === leftKey) {
            results = addAndFlatten(results, this.values[i]._betweenAsc(clone(leftKeys), rightKeys.map(function () { return undefined }), opts))
          } else if (currKey === rightKey) {
            results = addAndFlatten(results, this.values[i]._betweenAsc(leftKeys.map(function () { return undefined }), clone(rightKeys), opts))
          } else {
            results = addAndFlatten(results, this.values[i].getAll())
          }
        } else {
          results = addAndFlatten(results, this.values[i])
        }

        if (opts.limit) {
          if (results.length >= (opts.limit + opts.offset)) {
            break
          }
        }
      }
    }

    if (opts.limit) {
      return results.slice(0, opts.limit + opts.offset)
    } else {
      return results
    }
  },

  // TODO: For now, duplicate all the code of _between into two methods, until it is known how different the two methods are.
  _betweenDesc: function (leftKeys, rightKeys, opts) {
    let results = []

    let leftKey = leftKeys.shift()
    let rightKey = rightKeys.shift()

    let pos

    if (rightKey !== undefined) {
      pos = binarySearch(this.keys, rightKey)
    } else {
      pos = {
        found: false,
        index: this.keys.length - 1
      }
    }

    if (leftKeys.length === 0) {
      if (pos.found && opts.rightInclusive === false) {
        pos.index -= 1
      }

      for (let i = pos.index; i >= 0; i -= 1) {
        if (leftKey !== undefined) {
          if (opts.leftInclusive) {
            if (this.keys[i] < leftKey) { break }
          } else {
            if (this.keys[i] <= leftKey) { break }
          }
        }

        if (this.values[i].isIndex) {
          results = addAndFlatten(results, this.values[i].getAll(opts))
        } else {
          let list = this.values[i].slice()
          list.reverse()
          results = addAndFlatten(results, list)
        }

        if (opts.limit) {
          if (results.length >= (opts.limit + opts.offset)) {
            break
          }
        }
      }
    } else {
      for (let i = pos.index; i >= 0; i -= 1) {
        let currKey = this.keys[i]
        if (currKey < leftKey) { break }

        if (this.values[i].isIndex) {
          if (currKey === rightKey) {
            results = addAndFlatten(results, this.values[i]._betweenDesc(leftKeys.map(function () { return undefined }), clone(rightKeys), opts))
          } else if (currKey === leftKey) {
            results = addAndFlatten(results, this.values[i]._betweenDesc(clone(leftKeys), rightKeys.map(function () { return undefined }), opts))
          } else {
            results = addAndFlatten(results, this.values[i].getAll(opts))
          }
        } else {
          let list = this.values[i].slice()
          list.reverse()
          results = addAndFlatten(results, list)
        }

        if (opts.limit) {
          if (results.length >= (opts.limit + opts.offset)) {
            break
          }
        }
      }
    }

    if (opts.limit) {
      return results.slice(0, opts.limit + opts.offset)
    } else {
      return results
    }
  },

  remove: function (keyList, value) {
    if (!isArray(keyList)) {
      keyList = [keyList]
    }

    let key = keyList.shift()
    let pos = binarySearch(this.keys, key)

    if (keyList.length === 0) {
      if (pos.found) {
        let dataLocation = binarySearch(this.values[pos.index], value)
        if (dataLocation.found) {
          removeAt(this.values[pos.index], dataLocation.index)
          if (this.values[pos.index].length === 0) {
            removeAt(this.keys, pos.index)
            removeAt(this.values, pos.index)
          }
        }
      }
    } else {
      if (pos.found) {
        this.values[pos.index].remove(keyList, value)
      }
    }
  },

  clear: function () {
    this.keys = []
    this.values = []
  },

  insertRecord: function (data) {
    if (data.id == null) {
      throw new Error('Record must have an id property')
    }

    let keyList = this.fieldList.map(function (field) {
      return data[field] || null
    })

    this.set(keyList, data.id)
  },

  removeRecord: function (data) {
    let keyList = this.fieldList.map(function (field) {
      return data[field] || null
    })

    this.remove(keyList, data.id)
  },

  updateRecord: function (data) {
    this.removeRecord(data)
    this.insertRecord(data)
  }
}

var createIndex = function (fieldList) {
  fieldList = fieldList || []
  var index = Object.create(BaseSecondaryIndex)

  if (!isArray(fieldList)) {
    throw new Error('fieldList must be an array.')
  }

  index.fieldList = fieldList
  index.isIndex = true
  index.keys = []
  index.values = []

  return index
}

module.exports = createIndex
