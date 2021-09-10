import makeSearchIndex from './mk-search-index.mjs'

/**
 * Encodes an array of small non negative integers into a small string.
 * This is useful for large arrays. Firstly, it makes the resulting data file
 * smaller, and therefore faster to download and parse. Secondly it uses less
 * memory when parsed.
 * @param array the array to encode
 * @returns the result string
 */
function encodeIntegerArray (array) {
  const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&'()*+,-./:;<=>?@[]^_`{|}"
  const MORE = '~'
  let result = ''
  for (let n of array) {
    if (!Number.isSafeInteger(n) || n < 0) { throw new Error('invalid integer') }
    while (n >= ALPHABET.length) {
      result += MORE
      n -= ALPHABET.length
    }
    result += ALPHABET[n]
  }
  return result
}

/**
 * @see encodeIntegerArray
 * @param array the array to encode
 * @returns the result string
 */
function encodeArrayOfIntegerArrays (array) {
  return array.map(a => encodeIntegerArray(a)).join(' ')
}

export default function makeViewerData (classes) {
  const classesOut = [] // Classes
  const groupsOut = [] // Groups
  const studentsOut = [] // Students
  const subjectsOut = [] // Subjects
  const teachersOut = [] // Teachers
  const roomsOut = [] // Rooms
  const timesOut = [] // Colle starting times
  const weeksOut = [] // Program weeks

  for (const classData of classes) {
    // Add or reuse subjects.
    const remappedSubjectIndices = []
    const subjectUrls = {}
    for (const subject of classData.subjects) {
      let i = subjectsOut.indexOf(subject.name)
      if (i === -1) {
        // If the subject doesn't already exist, then add it and get
        // its new index.
        i = subjectsOut.length
        subjectsOut.push(subject.name)
      }
      remappedSubjectIndices.push(i)
      if (subject.url !== undefined) { subjectUrls[i] = subject.url }
    }

    // Add or reuse teachers.
    const remappedTeacherIndices = []
    for (const teacher of classData.teachers) {
      let i = teachersOut.indexOf(teacher)
      if (i === -1) {
        i = teachersOut.length
        teachersOut.push(teacher)
      }
      remappedTeacherIndices.push(i)
    }

    // Add or reuse weeks.
    const remappedWeekIndices = []
    for (const week of classData.weeks) {
      let i = weeksOut.indexOf(week)
      if (i === -1) {
        i = weeksOut.length
        weeksOut.push(week)
      }
      remappedWeekIndices.push(i)
    }

    // Add or reuse colle types.
    const collesOut = []
    for (const type of classData.colles) {
      // Add or reuse colle starting time.
      let remappedTime = timesOut.indexOf(type.time)
      if (remappedTime === -1) {
        remappedTime = timesOut.length
        timesOut.push(type.time)
      }

      const colleOut = [
        remappedSubjectIndices[type.subject],
        remappedTeacherIndices[type.teacher],
        type.day,
        remappedTime
      ]

      if (type.room) {
        // Add or reuse room.
        let remappedRoom = roomsOut.indexOf(type.room)
        if (remappedRoom === -1) {
          remappedRoom = roomsOut.length
          roomsOut.push(type.room)
        }
        colleOut.push(remappedRoom)
      }

      collesOut.push(colleOut)
    }

    const classOut = [
      classData.name, // Class name
      encodeArrayOfIntegerArrays(collesOut), // Colle templates
      encodeIntegerArray(remappedWeekIndices) // Program weeks
    ]

    // Only push the object when it is not empty to save memory in most
    // cases where it is empty.
    if (Object.keys(subjectUrls).length > 0) { classOut.push(subjectUrls) }

    // Put a new class entry and get its index so that we can use it in
    // other places later.
    const classIndex = classesOut.length
    classesOut.push(classOut)

    for (let i = 0; i < classData.groups.length; i++) {
      const group = classData.groups[i]

      // Same for the group.
      const groupIndex = groupsOut.length
      groupsOut.push([
        classIndex, // Class index
        i + classData.firstGroup, // Human readable group number
        encodeArrayOfIntegerArrays(group.program) // Colle program
      ])

      for (let j = 0; j < group.students.length; j++) {
        const studentOut = [
          groupIndex, // Group index
          group.students[j] // Student name
        ]

        // Only push the per-student program override when it is
        // defined to save memory in most cases where it is not.
        if (group.perStudentProgram !== undefined &&
                    group.perStudentProgram[j] !== undefined) {
          studentOut.push(group.perStudentProgram[j]
            .map(delta => [
              delta.week,
              delta.index === null ? -1 : delta.index,
              delta.newColle === null ? -1 : delta.newColle
            ]))
        }

        studentsOut.push(studentOut)
      }
    }
  }

  // Sort students by name.
  studentsOut.sort((a, b) => a[1].localeCompare(b[1], 'fr'))

  // Search index
  const searchIdxOut = makeSearchIndex(studentsOut.map(x => x[1]))

  return [
    classesOut,
    groupsOut,
    studentsOut,
    subjectsOut,
    teachersOut,
    roomsOut,
    timesOut,
    weeksOut,
    searchIdxOut
  ]
}
