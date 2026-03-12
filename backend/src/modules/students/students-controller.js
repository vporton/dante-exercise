const asyncHandler = require("express-async-handler");
const { getAllStudents, addNewStudent, getStudentDetail, setStudentStatus, updateStudent, deleteStudent } = require("./students-service");

const handleGetAllStudents = asyncHandler(async (req, res) => {
    const {
        page = "1",
        limit = "10",
        search,
        class: classFilter,
        className,
        section,
    } = req.query;

    const students = await getAllStudents({
        page: Number(page),
        limit: Number(limit),
        search,
        className: classFilter || className,
        section,
    });
    res.json(students);
});

const handleAddStudent = asyncHandler(async (req, res) => {
    const payload = req.body;
    const message = await addNewStudent(payload);
    res.json(message);
});

const handleUpdateStudent = asyncHandler(async (req, res) => {
    const { id: userId } = req.params;
    const payload = req.body;
    const message = await updateStudent({ ...payload, userId });
    res.json(message);
});

const handleGetStudentDetail = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const student = await getStudentDetail(id);
    res.json(student);
});

const handleStudentStatus = asyncHandler(async (req, res) => {
    const { id: userId } = req.params;
    const { id: reviewerId } = req.user;
    const payload = req.body;
    const message = await setStudentStatus({ ...payload, userId, reviewerId });
    res.json(message);
});

const handleDeleteStudent = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const message = await deleteStudent(id);
    res.json(message);
});

module.exports = {
    handleGetAllStudents,
    handleGetStudentDetail,
    handleAddStudent,
    handleStudentStatus,
    handleUpdateStudent,
    handleDeleteStudent,
};
