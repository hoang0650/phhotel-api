const { Staff } = require('../models/staff');

// Tạo nhân viên mới
async function createStaff (req, res) {
    const staff = new Staff(req.body);
    try {
        await staff.save();
        res.status(201).send(staff);
    } catch (error) {
        res.status(400).send(error);
    }
};

// Lấy tất cả nhân viên
async function getAllStaff (req, res) {
    try {
        const staffs = await Staff.find().populate('hotelId');
        res.status(200).send(staffs);
    } catch (error) {
        res.status(500).send(error);
    }
};

// Lấy nhân viên theo khách sạn
async function getStaff (req, res) {
    try {
        const staff = await Staff.find({ hotelId: req.params.hotelId }).populate('hotelId');
        res.status(200).send(staff);
    } catch (error) {
        res.status(500).send(error);
    }
};

// Lấy nhân viên theo ID
async function getStaffById(req, res) {
    try {
        const staff = await Staff.findById(req.params.id).populate('hotelId');
        if (!staff) return res.status(404).json({ message: 'Staff not found' });
        res.status(200).json(staff);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Cập nhật thông tin nhân viên
async function updateStaff (req, res) {
    try {
        const staff = await Staff.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!staff) {
            return res.status(404).send({ message: 'Staff not found' });
        }
        res.send(staff);
    } catch (error) {
        res.status(400).send(error);
    }
};

// Xóa nhân viên
async function deleteStaff (req, res) {
    try {
        const staff = await Staff.findByIdAndDelete(req.params.id);
        if (!staff) {
            return res.status(404).send({ message: 'Staff not found' });
        }
        res.send(staff);
    } catch (error) {
        res.status(500).send(error);
    }
};

// Tính lương cho nhân viên
async function calculateSalary(req, res) {
    try {
        const { staffId } = req.params;
        const { 
            calculationDate, // Ngày tính lương (mặc định là hôm nay)
            allowance, // Phụ cấp (nếu không có thì lấy từ staff.employmentInfo.allowance)
            insurance, // Bảo hiểm (nếu không có thì lấy từ staff.employmentInfo.insurance)
            penalty, // Phạt (nếu không có thì lấy từ staff.employmentInfo.penalty)
            bonus, // Thưởng (nếu không có thì lấy từ staff.employmentInfo.bonus)
            advancePayment // Ứng lương (nếu không có thì lấy từ staff.employmentInfo.advancePayment)
        } = req.body;

        const staff = await Staff.findById(staffId);
        if (!staff) {
            return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
        }

        // Lấy ngày tính lương (mặc định là hôm nay)
        const calcDate = calculationDate ? new Date(calculationDate) : new Date();
        calcDate.setHours(23, 59, 59, 999); // Đặt về cuối ngày để tính chính xác
        
        // Lấy ngày bắt đầu làm việc
        let originalStartDate;
        if (staff.employmentInfo?.startDate) {
            // Parse startDate từ database (có thể là Date object hoặc string)
            const startDateValue = staff.employmentInfo.startDate;
            originalStartDate = startDateValue instanceof Date 
                ? new Date(startDateValue.getTime()) 
                : new Date(startDateValue);
            originalStartDate.setHours(0, 0, 0, 0); // Đặt về đầu ngày
            
            // Validate date
            if (isNaN(originalStartDate.getTime())) {
                console.error('Error: Invalid startDate for staff:', staff._id, 'startDate:', startDateValue);
                originalStartDate = new Date(calcDate);
                originalStartDate.setHours(0, 0, 0, 0);
            }
        } else {
            // Nếu không có startDate, dùng calcDate (trường hợp đặc biệt)
            // Nhưng nên cảnh báo vì đây không phải là trường hợp bình thường
            console.warn('Warning: Staff does not have startDate. Using calculationDate as startDate.');
            originalStartDate = new Date(calcDate);
            originalStartDate.setHours(0, 0, 0, 0);
        }
        
        // Xác định ngày cơ sở để tính lương
        let baseDate;
        
        // Kiểm tra xem đã có payroll record nào chưa
        if (staff.payroll && staff.payroll.length > 0) {
            // Sắp xếp payroll theo thời gian tính lương (mới nhất trước)
            const sortedPayroll = [...staff.payroll].sort((a, b) => {
                const dateA = a.calculatedAt ? new Date(a.calculatedAt).getTime() : 
                             (a.period?.endDate ? new Date(a.period.endDate).getTime() : 0);
                const dateB = b.calculatedAt ? new Date(b.calculatedAt).getTime() : 
                             (b.period?.endDate ? new Date(b.period.endDate).getTime() : 0);
                return dateB - dateA; // Sắp xếp giảm dần
            });
            
            const lastPayroll = sortedPayroll[0];
            const lastPayrollEndDate = lastPayroll.period?.endDate ? new Date(lastPayroll.period.endDate) : 
                                      (lastPayroll.calculatedAt ? new Date(lastPayroll.calculatedAt) : null);
            const lastPayrollDaysWorked = lastPayroll.daysWorked || 0;
            
            // Nếu đã tính lương trước đó
            if (lastPayrollEndDate) {
                // Nếu số ngày làm việc trong payroll record trước < 30 ngày
                // => Tiếp tục tính từ ngày sau lastPayrollEndDate (tính tiếp tháng cũ)
                if (lastPayrollDaysWorked < 30) {
                    baseDate = new Date(lastPayrollEndDate);
                    baseDate.setDate(baseDate.getDate() + 1); // Ngày sau lastPayrollEndDate
                    baseDate.setHours(0, 0, 0, 0);
                    
                    // Đảm bảo baseDate không vượt quá calcDate
                    if (baseDate > calcDate) {
                        baseDate = new Date(calcDate);
                        baseDate.setHours(0, 0, 0, 0);
                    }
                } else {
                    // Nếu số ngày làm việc >= 30 ngày => Tính tháng mới
                    // Lấy ngày startDate nhưng của tháng calculationDate
                    const calcYear = calcDate.getFullYear();
                    const calcMonth = calcDate.getMonth();
                    const startDay = originalStartDate.getDate();
                    
                    // Tạo ngày cơ sở = ngày startDate nhưng của tháng calculationDate
                    // Ví dụ: startDate = 4/11, calculationDate = 15/12 => baseDate = 4/12
                    baseDate = new Date(calcYear, calcMonth, startDay);
                    baseDate.setHours(0, 0, 0, 0);
                    
                    // Đảm bảo baseDate không vượt quá calcDate
                    if (baseDate > calcDate) {
                        // Nếu baseDate vượt quá calcDate, lùi về tháng trước
                        baseDate = new Date(calcYear, calcMonth - 1, startDay);
                        baseDate.setHours(0, 0, 0, 0);
                    }
                    
                    // QUAN TRỌNG: Khi đã đủ 30 ngày, baseDate PHẢI là ngày startDate của tháng mới
                    // Chỉ điều chỉnh nếu baseDate và lastPayrollEndDate CÙNG THÁNG
                    // Nếu khác tháng, baseDate là ngày startDate của tháng mới => giữ nguyên
                    const lastPayrollEndDateOnly = new Date(lastPayrollEndDate);
                    lastPayrollEndDateOnly.setHours(23, 59, 59, 999); // Cuối ngày
                    
                    // Kiểm tra xem baseDate và lastPayrollEndDate có cùng tháng không
                    const baseDateMonth = baseDate.getMonth();
                    const baseDateYear = baseDate.getFullYear();
                    const lastPayrollMonth = lastPayrollEndDate.getMonth();
                    const lastPayrollYear = lastPayrollEndDate.getFullYear();
                    
                    // Chỉ điều chỉnh nếu:
                    // 1. baseDate <= lastPayrollEndDate (tránh tính trùng)
                    // 2. VÀ cùng tháng, cùng năm (có nghĩa là tính lương trong cùng tháng)
                    // Nếu khác tháng, baseDate là ngày startDate của tháng mới => giữ nguyên
                    if (baseDate <= lastPayrollEndDateOnly && 
                        baseDateMonth === lastPayrollMonth && 
                        baseDateYear === lastPayrollYear) {
                        // Cùng tháng và baseDate <= lastPayrollEndDate => dùng ngày sau lastPayrollEndDate
                        baseDate = new Date(lastPayrollEndDate);
                        baseDate.setDate(baseDate.getDate() + 1);
                        baseDate.setHours(0, 0, 0, 0);
                        
                        // Đảm bảo baseDate không vượt quá calcDate
                        if (baseDate > calcDate) {
                            baseDate = new Date(calcDate);
                            baseDate.setHours(0, 0, 0, 0);
                        }
                    }
                    // Nếu khác tháng hoặc baseDate > lastPayrollEndDate, giữ nguyên baseDate (ngày startDate của tháng mới)
                }
            } else {
                // Nếu không có endDate, dùng originalStartDate
                baseDate = new Date(originalStartDate);
                baseDate.setHours(0, 0, 0, 0);
            }
        } else {
            // Chưa có payroll record nào, dùng ngày bắt đầu làm việc
            // QUAN TRỌNG: baseDate PHẢI là originalStartDate, KHÔNG BAO GIỜ gán = calcDate
            baseDate = new Date(originalStartDate);
            baseDate.setHours(0, 0, 0, 0);
            
            // Chỉ cảnh báo nếu startDate > calcDate, nhưng vẫn dùng startDate
            if (baseDate > calcDate && staff.employmentInfo?.startDate) {
                console.warn('Warning: startDate is after calculationDate. Using startDate as baseDate.');
            }
        }
        
        // Đảm bảo baseDate không vượt quá calcDate (chỉ cho trường hợp đã có payroll)
        // KHÔNG áp dụng cho trường hợp chưa có payroll vì baseDate phải là startDate
        if (staff.payroll && staff.payroll.length > 0 && baseDate > calcDate) {
            baseDate = new Date(calcDate);
            baseDate.setHours(0, 0, 0, 0);
        }
        
        // Tính số ngày thực làm (từ baseDate đến calculationDate)
        // Sử dụng Math.ceil để làm tròn lên, đảm bảo tính cả ngày đầu và ngày cuối
        const daysDiff = Math.ceil((calcDate.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
        const daysWorked = Math.max(1, daysDiff); // Tối thiểu 1 ngày
        
        // Debug log để kiểm tra
        console.log('Salary Calculation Debug:', {
            staffId: staff._id?.toString(),
            hasStartDate: !!staff.employmentInfo?.startDate,
            startDateValue: staff.employmentInfo?.startDate,
            originalStartDate: originalStartDate.toISOString(),
            baseDate: baseDate.toISOString(),
            calcDate: calcDate.toISOString(),
            daysWorked: daysWorked,
            hasPayroll: !!(staff.payroll && staff.payroll.length > 0),
            payrollCount: staff.payroll?.length || 0
        });

        // Lấy lương cơ bản
        const baseSalary = staff.employmentInfo?.salary || 0;
        
        // Tính lương theo số ngày làm việc (giả sử 1 tháng = 30 ngày)
        const monthlySalary = (baseSalary / 30) * daysWorked;

        // Lấy các khoản phụ cấp, bảo hiểm, phạt, thưởng, ứng lương
        const allowanceAmount = allowance !== undefined ? Number(allowance) : (staff.employmentInfo?.allowance || 0);
        const insuranceAmount = insurance !== undefined ? Number(insurance) : (staff.employmentInfo?.insurance || 0);
        const penaltyAmount = penalty !== undefined ? Number(penalty) : (staff.employmentInfo?.penalty || 0);
        const bonusAmount = bonus !== undefined ? Number(bonus) : (staff.employmentInfo?.bonus || 0);
        const advancePaymentAmount = advancePayment !== undefined ? Number(advancePayment) : (staff.employmentInfo?.advancePayment || 0);

        // Tính lương thực nhận
        // Lương thực nhận = (Lương cơ bản theo ngày) + Phụ cấp + Thưởng - Bảo hiểm - Phạt - Ứng lương
        const netSalary = monthlySalary + allowanceAmount + bonusAmount - insuranceAmount - penaltyAmount - advancePaymentAmount;

        // CHỈ TRẢ VỀ KẾT QUẢ TÍNH LƯƠNG, KHÔNG LƯU VÀO PAYROLL
        // Chỉ lưu vào payroll khi bấm "Đã thanh toán"
        res.status(200).json({
            message: 'Tính lương thành công',
            data: {
                staff: {
                    _id: staff._id,
                    name: `${staff.personalInfo?.firstName || ''} ${staff.personalInfo?.lastName || ''}`.trim()
                },
                breakdown: {
                    baseSalary: monthlySalary,
                    daysWorked: daysWorked,
                    baseDate: baseDate, // Ngày cơ sở để tính lương
                    calculationDate: calcDate, // Ngày tính lương
                    startDate: originalStartDate, // Ngày bắt đầu làm việc
                    allowance: allowanceAmount,
                    insurance: insuranceAmount,
                    penalty: penaltyAmount,
                    bonus: bonusAmount,
                    advancePayment: advancePaymentAmount, // Ứng lương
                    totalAdditions: allowanceAmount + bonusAmount,
                    totalDeductions: insuranceAmount + penaltyAmount + advancePaymentAmount,
                    netSalary: Math.max(0, netSalary)
                }
            }
        });
    } catch (error) {
        console.error('Error calculating salary:', error);
        res.status(500).json({ 
            message: 'Lỗi khi tính lương', 
            error: error.message 
        });
    }
}

// Lưu lương vào payroll và đánh dấu đã thanh toán
async function paySalary(req, res) {
    try {
        const { staffId } = req.params;
        const { 
            calculationDate,
            baseDate, // Ngày cơ sở để tính lương
            allowance,
            insurance,
            penalty,
            bonus,
            advancePayment, // Ứng lương
            paymentDate, // Ngày thanh toán
            paymentReference // Số tham chiếu thanh toán
        } = req.body;

        const staff = await Staff.findById(staffId);
        if (!staff) {
            return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
        }

        // Tính lại để đảm bảo tính chính xác
        const calcDate = calculationDate ? new Date(calculationDate) : new Date();
        calcDate.setHours(23, 59, 59, 999);
        
        const baseDateObj = baseDate ? new Date(baseDate) : new Date();
        baseDateObj.setHours(0, 0, 0, 0);
        
        // Tính số ngày làm việc
        const daysDiff = Math.ceil((calcDate.getTime() - baseDateObj.getTime()) / (1000 * 60 * 60 * 24));
        const daysWorked = Math.max(1, daysDiff);

        // Lấy lương cơ bản
        const baseSalary = staff.employmentInfo?.salary || 0;
        const monthlySalary = (baseSalary / 30) * daysWorked;

        // Lấy các khoản phụ cấp, bảo hiểm, phạt, thưởng, ứng lương
        const allowanceAmount = allowance !== undefined ? Number(allowance) : (staff.employmentInfo?.allowance || 0);
        const insuranceAmount = insurance !== undefined ? Number(insurance) : (staff.employmentInfo?.insurance || 0);
        const penaltyAmount = penalty !== undefined ? Number(penalty) : (staff.employmentInfo?.penalty || 0);
        const bonusAmount = bonus !== undefined ? Number(bonus) : (staff.employmentInfo?.bonus || 0);
        const advancePaymentAmount = advancePayment !== undefined ? Number(advancePayment) : (staff.employmentInfo?.advancePayment || 0);

        // Tính lương thực nhận
        // Lương thực nhận = (Lương cơ bản theo ngày) + Phụ cấp + Thưởng - Bảo hiểm - Phạt - Ứng lương
        const netSalary = monthlySalary + allowanceAmount + bonusAmount - insuranceAmount - penaltyAmount - advancePaymentAmount;

        // Tạo bản ghi payroll và lưu vào database
        const payrollRecord = {
            period: {
                startDate: baseDateObj,
                endDate: calcDate
            },
            baseSalary: monthlySalary,
            daysWorked: daysWorked,
            allowance: allowanceAmount,
            insurance: insuranceAmount,
            penalty: penaltyAmount,
            bonus: bonusAmount,
            advancePayment: advancePaymentAmount, // Ứng lương
            overtime: 0,
            bonuses: bonusAmount,
            deductions: insuranceAmount + penaltyAmount + advancePaymentAmount,
            netSalary: Math.max(0, netSalary),
            paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
            paymentStatus: 'paid', // Đánh dấu đã thanh toán
            paymentReference: paymentReference || '',
            calculatedAt: new Date()
        };

        // Thêm vào mảng payroll của staff
        if (!staff.payroll) {
            staff.payroll = [];
        }
        staff.payroll.push(payrollRecord);
        
        await staff.save();

        res.status(200).json({
            message: 'Đã lưu lương và đánh dấu đã thanh toán thành công',
            data: {
                staff: {
                    _id: staff._id,
                    name: `${staff.personalInfo?.firstName || ''} ${staff.personalInfo?.lastName || ''}`.trim()
                },
                payroll: payrollRecord
            }
        });
    } catch (error) {
        console.error('Error paying salary:', error);
        res.status(500).json({ 
            message: 'Lỗi khi lưu lương', 
            error: error.message 
        });
    }
}

async function getPayrollRecords(req, res) {
    try {
        const monthInput = typeof req.query.month === 'string' ? req.query.month : '';
        const staffId = typeof req.query.staffId === 'string' ? req.query.staffId : '';

        const pad2 = (value) => String(value).padStart(2, '0');

        const normalizeMonthKey = (value) => {
            const now = new Date();
            if (!value) return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;

            if (value.includes('/')) {
                const [mRaw, yRaw] = value.split('/');
                const month = Number(mRaw);
                const year = Number(yRaw);
                if (!Number.isFinite(month) || !Number.isFinite(year) || month < 1 || month > 12) {
                    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
                }
                return `${year}-${pad2(month)}`;
            }

            if (value.includes('-')) {
                const [yRaw, mRaw] = value.split('-');
                const month = Number(mRaw);
                const year = Number(yRaw);
                if (!Number.isFinite(month) || !Number.isFinite(year) || month < 1 || month > 12) {
                    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
                }
                return `${year}-${pad2(month)}`;
            }

            return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
        };

        const monthKey = normalizeMonthKey(monthInput);
        const [yearStr, monthStr] = monthKey.split('-');
        const year = Number(yearStr);
        const month = Number(monthStr);
        const monthLabel = `${pad2(month)}/${year}`;

        const monthKeyFromDate = (d) => {
            const dt = d ? new Date(d) : null;
            if (!dt || Number.isNaN(dt.getTime())) return null;
            return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}`;
        };

        const staffQuery = staffId ? Staff.find({ _id: staffId }) : Staff.find();
        const staffs = await staffQuery.select('_id name email personalInfo employmentInfo payroll').lean();

        const records = [];

        for (const staff of staffs) {
            const staffName =
                `${staff.personalInfo?.firstName || ''} ${staff.personalInfo?.lastName || ''}`.trim() ||
                staff.name ||
                staff.email ||
                '';

            const payroll = Array.isArray(staff.payroll) ? staff.payroll : [];

            const paidForMonth = payroll
                .map((p) => ({ p, key: monthKeyFromDate(p?.period?.endDate || p?.paymentDate || p?.calculatedAt) }))
                .filter((x) => x.key === monthKey)
                .sort((a, b) => {
                    const ad = new Date(a.p?.period?.endDate || a.p?.paymentDate || a.p?.calculatedAt || 0).getTime();
                    const bd = new Date(b.p?.period?.endDate || b.p?.paymentDate || b.p?.calculatedAt || 0).getTime();
                    return bd - ad;
                })[0]?.p;

            if (paidForMonth && paidForMonth.paymentStatus === 'paid') {
                const baseSalary = Number(paidForMonth.baseSalary || 0);
                const bonus = Number((paidForMonth.allowance || 0) + (paidForMonth.bonus || paidForMonth.bonuses || 0));
                const deductions = Number(
                    paidForMonth.deductions !== undefined
                        ? paidForMonth.deductions
                        : (paidForMonth.insurance || 0) + (paidForMonth.penalty || 0) + (paidForMonth.advancePayment || 0)
                );
                const netSalary = Number(
                    paidForMonth.netSalary !== undefined
                        ? paidForMonth.netSalary
                        : Math.max(0, baseSalary + bonus - deductions)
                );

                records.push({
                    id: String(paidForMonth._id || `${staff._id}_${monthKey}`),
                    staffId: String(staff._id),
                    staffName,
                    baseSalary,
                    bonus,
                    deductions,
                    netSalary,
                    month: monthLabel,
                    paidAt: paidForMonth.paymentDate ? new Date(paidForMonth.paymentDate).toISOString() : undefined,
                    status: 'paid'
                });
                continue;
            }

            const employment = staff.employmentInfo || {};
            const baseSalary = Number(employment.salary || 0);
            const bonus = Number((employment.allowance || 0) + (employment.bonus || 0));
            const deductions = Number((employment.insurance || 0) + (employment.penalty || 0) + (employment.advancePayment || 0));
            const netSalary = Math.max(0, baseSalary + bonus - deductions);

            records.push({
                id: monthKey,
                staffId: String(staff._id),
                staffName,
                baseSalary,
                bonus,
                deductions,
                netSalary,
                month: monthLabel,
                status: 'pending'
            });
        }

        res.status(200).json(records);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

module.exports = {
    createStaff,
    getAllStaff,
    getStaff,
    getStaffById,
    updateStaff,
    deleteStaff,
    calculateSalary,
    paySalary,
    getPayrollRecords
}
