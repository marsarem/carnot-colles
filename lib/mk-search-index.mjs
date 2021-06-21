/**
 * Takes a search index which is a data structure as described in
 * {@link makeSearchIndex} and sorts its keys in lexicographic order.
 * @param index the index to sort
 * @returns the same index but with the keys sorted in lexicographic order
 */
function sortSearchIndex (index) {
  const result = {}
  // We have to rebuild a new object because we cannot reorder the keys of an
  // object in JS.
  for (const c of Object.keys(index).sort()) {
    const cIndex = index[c]

    const cIndexSorted = {}
    for (const word of Object.keys(cIndex).sort()) { cIndexSorted[word] = cIndex[word].sort() }

    result[c] = cIndexSorted
  }
  return result
}

/**
 * Generates a data structure that makes searching students from their names
 * faster on the client later.
 *
 * The students names are split into tokens. The data structure returned is an
 * object whose keys are the first characters of those tokens and whose values
 * are themselves an object whose keys are the tokens and whose values are an
 * array of indices to the names in studentNames.
 *
 * The index is sorted to increase the potential of compression when it will
 * be serialized into JSON and streamed over the Internet.
 *
 * @param {string[]} studentNames an array of student names
 */
export default function makeSearchIndex (studentNames) {
  const index = {}
  for (let i = 0; i < studentNames.length; i++) {
    const words = studentNames[i]
      .toLowerCase()
    // Remove accents
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/\W+/g)
    // Remove things like "D'"
      .filter(w => w.length >= 2)
    for (const word of words) {
      const firstChar = word[0]
      if (index[firstChar] === undefined) { index[firstChar] = {} }
      const firstCharIndex = index[firstChar]
      if (firstCharIndex[word] === undefined) { firstCharIndex[word] = [] }
      firstCharIndex[word].push(i)
    }
  }

  // Sort the entries for better compression of the final JSON.
  return sortSearchIndex(index)
}
